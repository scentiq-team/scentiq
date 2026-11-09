// `seed:dev` for the catalog (ADR-0015): invented brands and about twenty products with placeholder
// photos, built through the SAME services and media pipeline the real Studio will use, so the
// seed also proves they work together. It never runs in production (the runner refuses), and every
// row it inserts, in any table, is recorded in `sample_data_registry`.
//
// Running it twice is safe: when the first sample brand exists the seeder does nothing.

import { eq, inArray } from 'drizzle-orm';
import {
  addVariant,
  archiveProduct,
  createBrand,
  createProduct,
  publishProduct,
  setProductImages,
  setProductNotes,
  setProductTags,
} from '../../modules/catalog/index.js';
import { processAndStoreImage } from '../../modules/media/index.js';
import type { MediaStorage } from '../../modules/media/storage.js';
import type { AuditActor } from '../audit.js';
import type { Tx } from '../client.js';
import { brands, categories, families, notes, tags } from '../schema/taxonomy.js';
import { DEV_BRANDS, DEV_PRODUCTS, type DevProduct, devBrandStory } from './data/dev-data.js';
import { placeholderImage } from './placeholder-image.js';
import { applyReferenceCatalog } from './reference-catalog.js';
import type { Seeder } from './runner.js';
import { trackNewRows } from './tracking.js';

const ACTOR: AuditActor = { type: 'system' };

type Ids = Map<string, string>;

interface ReferenceIds {
  categories: Ids;
  families: Ids;
  notes: Ids;
  tags: Ids;
}

/** slug to id for the rows the sample products point at. */
async function loadReferenceIds(tx: Tx): Promise<ReferenceIds> {
  const slugs = (pick: (product: DevProduct) => readonly (string | undefined)[]) => [
    ...new Set(DEV_PRODUCTS.flatMap(pick).filter((slug): slug is string => slug !== undefined)),
  ];
  const lookup = async (rows: Promise<{ id: string; slug: string }[]>): Promise<Ids> =>
    new Map((await rows).map((row) => [row.slug, row.id]));

  return {
    categories: await lookup(
      tx
        .select({ id: categories.id, slug: categories.slug })
        .from(categories)
        .where(
          inArray(
            categories.slug,
            slugs((p) => [p.category]),
          ),
        ),
    ),
    families: await lookup(
      tx
        .select({ id: families.id, slug: families.slug })
        .from(families)
        .where(
          inArray(
            families.slug,
            slugs((p) => [p.family, p.secondaryFamily]),
          ),
        ),
    ),
    notes: await lookup(
      tx
        .select({ id: notes.id, slug: notes.slug })
        .from(notes)
        .where(
          inArray(
            notes.slug,
            slugs((p) => p.notes.map((note) => note.slug)),
          ),
        ),
    ),
    tags: await lookup(
      tx
        .select({ id: tags.id, slug: tags.slug })
        .from(tags)
        .where(
          inArray(
            tags.slug,
            slugs((p) => p.tags),
          ),
        ),
    ),
  };
}

/** The id for a slug, or a clear error that names what is missing from the reference data. */
function need(ids: Ids, kind: string, slug: string): string {
  const id = ids.get(slug);
  if (id === undefined)
    throw new Error(`Sample data uses ${kind} "${slug}", which does not exist.`);
  return id;
}

/** A one-paragraph description that says what it is: sample data, built from the product's notes. */
function sampleDescription(product: DevProduct, language: 'ar' | 'en'): string {
  return language === 'ar'
    ? `${product.nameAr}: منتج تجريبي من بيانات العينة، ولا يمثل منتجاً حقيقياً. يظهر هنا ليجرّب الفريق شكل الصفحة والبحث والفلاتر.`
    : `${product.nameEn}: a sample product from development data. It does not represent a real product. It is here so the team can try the page, the search and the filters.`;
}

async function seedProduct(
  tx: Tx,
  storage: MediaStorage,
  ids: ReferenceIds,
  brandIds: Ids,
  product: DevProduct,
  index: number,
): Promise<void> {
  const brand = DEV_BRANDS.find((b) => b.slug === product.brand);
  if (brand === undefined) throw new Error(`Sample product uses unknown brand "${product.brand}".`);

  const created = await createProduct(tx, ACTOR, {
    brandId: need(brandIds, 'brand', product.brand),
    categoryId: need(ids.categories, 'category', product.category),
    nameAr: product.nameAr,
    nameEn: product.nameEn,
    descriptionAr: sampleDescription(product, 'ar'),
    descriptionEn: sampleDescription(product, 'en'),
    gender: product.gender,
    ...(product.concentration === undefined ? {} : { concentration: product.concentration }),
    ...(product.intensity === undefined ? {} : { intensity: product.intensity }),
    primaryFamilyId: need(ids.families, 'family', product.family),
    ...(product.secondaryFamily === undefined
      ? {}
      : { secondaryFamilyId: need(ids.families, 'family', product.secondaryFamily) }),
    seoTitleAr: `${product.nameAr} | ${brand.nameAr}`,
    seoTitleEn: `${product.nameEn} | ${brand.nameEn}`,
    seoDescriptionAr: `${product.nameAr} من ${brand.nameAr}: منتج تجريبي من بيانات العينة.`,
    seoDescriptionEn: `${product.nameEn} by ${brand.nameEn}: a sample product from development data.`,
  });

  await setProductNotes(
    tx,
    ACTOR,
    created.id,
    product.notes.map((note) => ({
      noteId: need(ids.notes, 'note', note.slug),
      position: note.position,
      prominence: note.prominence,
    })),
  );
  await setProductTags(
    tx,
    ACTOR,
    created.id,
    product.tags.map((slug) => need(ids.tags, 'tag', slug)),
  );

  let order = 0;
  for (const variant of product.variants) {
    await addVariant(tx, ACTOR, created.id, {
      sku: variant.sku,
      sizeValue: variant.size,
      ...(variant.unit === undefined ? {} : { sizeUnit: variant.unit }),
      priceIqd: variant.priceIqd,
      sortOrder: order,
    });
    order += 1;
  }

  const mediaIds: string[] = [];
  for (let shot = 0; shot < product.images; shot += 1) {
    const stored = await processAndStoreImage(tx, storage, ACTOR, {
      bytes: await placeholderImage(index, shot),
      originalLabel: `placeholder-${created.slug}-${shot + 1}.png`,
      altAr: `زجاجة ${product.nameAr} (صورة توضيحية)`,
      altEn: `${product.nameEn} bottle (placeholder image)`,
    });
    mediaIds.push(stored.asset.id);
  }
  if (mediaIds.length > 0) await setProductImages(tx, ACTOR, created.id, mediaIds);

  if (product.status === 'published' || product.status === 'archived') {
    await publishProduct(tx, ACTOR, created.id);
  }
  if (product.status === 'archived') await archiveProduct(tx, ACTOR, created.id);
}

export const devCatalog: Seeder = {
  name: 'dev catalog (sample brands and products)',
  level: 'dev',
  async run(tx, context) {
    const storage = context.mediaStorage;
    if (storage === undefined) {
      throw new Error(
        'The dev catalog seeder needs a media storage to put the placeholder images in.',
      );
    }

    const first = DEV_BRANDS[0];
    if (first === undefined) return;
    const present = await tx
      .select({ id: brands.id })
      .from(brands)
      .where(eq(brands.slug, first.slug))
      .limit(1);
    if (present.length > 0) {
      context.log('the sample catalog is already there: nothing to do');
      return;
    }

    // The reference vocabulary the sample products use. Idempotent, and NOT sample data, so it is
    // inserted before tracking starts.
    await applyReferenceCatalog(tx);
    const ids = await loadReferenceIds(tx);

    const { registered } = await trackNewRows(tx, context, async () => {
      const brandIds: Ids = new Map();
      for (const brand of DEV_BRANDS) {
        const row = await createBrand(tx, ACTOR, {
          slug: brand.slug,
          nameAr: brand.nameAr,
          nameEn: brand.nameEn,
          countryCode: brand.countryCode,
          storyAr: devBrandStory.ar,
          storyEn: devBrandStory.en,
        });
        brandIds.set(brand.slug, row.id);
      }
      for (const [index, product] of DEV_PRODUCTS.entries()) {
        await seedProduct(tx, storage, ids, brandIds, product, index);
      }
    });

    const total = Object.values(registered).reduce((sum, count) => sum + count, 0);
    context.log(
      `${DEV_BRANDS.length} brands and ${DEV_PRODUCTS.length} products added; ${total} rows registered as sample data`,
    );
  },
};
