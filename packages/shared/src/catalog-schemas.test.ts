import { describe, expect, it } from 'vitest';
import { MAX_IMAGES_PER_PRODUCT, MAX_PRICE_IQD } from './catalog-constants.js';
import {
  altTextSchema,
  brandInputSchema,
  brandUpdateSchema,
  categoryInputSchema,
  noteInputSchema,
  optionalText,
  productCreateSchema,
  productImagesInputSchema,
  productNotesInputSchema,
  productTagsInputSchema,
  productUpdateSchema,
  slugSchema,
  tagInputSchema,
  variantInputSchema,
  variantUpdateSchema,
} from './catalog-schemas.js';

const id = (n: number) => `0198a4b2-0000-7000-8000-${String(n).padStart(12, '0')}`;

const issues = (result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((i) => i.path.join('.')) ?? [];

describe('slugSchema', () => {
  it.each(['oud', 'baccarat-rouge-540', '540'])('accepts %s', (slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(true);
  });
  it.each(['', 'Oud', 'عود', '-a', 'a-', 'a--b', 'a b', 'a'.repeat(121)])('rejects %j', (slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(false);
  });
});

describe('optionalText', () => {
  const schema = optionalText(5);
  it('keeps a missing field missing, so an update does not clear it', () => {
    const parsed = productUpdateSchema.parse({});
    expect('descriptionAr' in parsed).toBe(false);
    expect(Object.keys(parsed)).toEqual([]);
  });
  it('turns a blank string into null and trims text', () => {
    expect(productUpdateSchema.parse({ descriptionAr: '   ' }).descriptionAr).toBeNull();
    expect(productUpdateSchema.parse({ descriptionAr: '  وصف  ' }).descriptionAr).toBe('وصف');
    expect(productUpdateSchema.parse({ descriptionAr: null }).descriptionAr).toBeNull();
  });
  it('rejects text over the limit', () => {
    expect(schema.safeParse('x'.repeat(6)).success).toBe(false);
    expect(schema.safeParse('x'.repeat(5)).success).toBe(true);
  });
});

describe('brand', () => {
  const valid = { nameAr: 'ديور', nameEn: 'Dior' };
  it('accepts the minimum and a full brand', () => {
    expect(brandInputSchema.safeParse(valid).success).toBe(true);
    expect(
      brandInputSchema.safeParse({
        ...valid,
        slug: 'dior',
        countryCode: 'FR',
        storyAr: 'قصة',
        logoMediaId: id(1),
      }).success,
    ).toBe(true);
  });
  it('requires both names, a valid country code and a uuid logo', () => {
    expect(issues(brandInputSchema.safeParse({ nameAr: 'ديور' }))).toContain('nameEn');
    expect(issues(brandInputSchema.safeParse({ ...valid, countryCode: 'fr' }))).toContain(
      'countryCode',
    );
    expect(issues(brandInputSchema.safeParse({ ...valid, logoMediaId: 'nope' }))).toContain(
      'logoMediaId',
    );
  });
  it('rejects keys it does not know (no mass assignment of columns like id or archivedAt)', () => {
    const result = brandInputSchema.safeParse({ ...valid, archivedAt: '2026-01-01', id: id(1) });
    expect(result.success).toBe(false);
  });
  it('allows a partial update', () => {
    expect(brandUpdateSchema.safeParse({ storyAr: 'جديد' }).success).toBe(true);
    expect(brandUpdateSchema.safeParse({}).success).toBe(true);
  });
});

describe('category and tag and note inputs', () => {
  it('category takes an optional parent', () => {
    expect(categoryInputSchema.safeParse({ nameAr: 'عطور', nameEn: 'Perfumes' }).success).toBe(
      true,
    );
    expect(
      categoryInputSchema.safeParse({ nameAr: 'عطور', nameEn: 'Perfumes', parentId: id(2) })
        .success,
    ).toBe(true);
    expect(
      categoryInputSchema.safeParse({ nameAr: 'عطور', nameEn: 'Perfumes', sortOrder: -1 }).success,
    ).toBe(false);
  });
  it('tag type must be one of the four', () => {
    expect(tagInputSchema.safeParse({ type: 'mood', nameAr: 'هادئ', nameEn: 'Calm' }).success).toBe(
      true,
    );
    expect(
      tagInputSchema.safeParse({ type: 'colour', nameAr: 'أحمر', nameEn: 'Red' }).success,
    ).toBe(false);
  });
  it('note aliases are unique ignoring case and at most 60 characters', () => {
    const base = { groupId: id(3), nameAr: 'عود', nameEn: 'Oud' };
    expect(noteInputSchema.safeParse({ ...base, aliases: ['oudh', 'ud'] }).success).toBe(true);
    expect(noteInputSchema.safeParse({ ...base, aliases: ['Oudh', 'oudh'] }).success).toBe(false);
    expect(noteInputSchema.safeParse({ ...base, aliases: ['x'.repeat(61)] }).success).toBe(false);
    expect(noteInputSchema.safeParse({ ...base, aliases: ['   '] }).success).toBe(false);
  });
});

describe('product', () => {
  const valid = { brandId: id(1), nameAr: 'عود ملكي' };

  it('accepts the minimum', () => {
    expect(productCreateSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a complete product', () => {
    const result = productCreateSchema.safeParse({
      ...valid,
      slug: 'royal-oud',
      categoryId: id(2),
      nameEn: 'Royal Oud',
      descriptionAr: 'وصف',
      concentration: 'edp',
      gender: 'unisex',
      intensity: 4,
      primaryFamilyId: id(3),
      secondaryFamilyId: id(4),
      seoTitleAr: 'عنوان',
      seoDescriptionAr: 'وصف',
    });
    expect(result.success).toBe(true);
  });

  it.each([
    ['a blank Arabic name', { nameAr: '   ' }, 'nameAr'],
    ['an Arabic name over 200 characters', { nameAr: 'ا'.repeat(201) }, 'nameAr'],
    ['a missing brand', { brandId: undefined }, 'brandId'],
    ['a brand that is not a uuid', { brandId: '123' }, 'brandId'],
    ['an unknown concentration', { concentration: 'cologne' }, 'concentration'],
    ['an unknown gender', { gender: 'kids' }, 'gender'],
    ['an intensity of 0', { intensity: 0 }, 'intensity'],
    ['an intensity of 6', { intensity: 6 }, 'intensity'],
    ['a fractional intensity', { intensity: 2.5 }, 'intensity'],
    ['an Arabic slug', { slug: 'عود' }, 'slug'],
    ['an SEO title over 120 characters', { seoTitleAr: 'ا'.repeat(121) }, 'seoTitleAr'],
    [
      'an SEO description over 400 characters',
      { seoDescriptionAr: 'ا'.repeat(401) },
      'seoDescriptionAr',
    ],
  ])('rejects %s', (_label, change, path) => {
    const result = productCreateSchema.safeParse({ ...valid, ...change });
    expect(result.success).toBe(false);
    expect(issues(result)).toContain(path);
  });

  it('rejects the same family as primary and secondary, like the database CHECK', () => {
    const result = productCreateSchema.safeParse({
      ...valid,
      primaryFamilyId: id(3),
      secondaryFamilyId: id(3),
    });
    expect(issues(result)).toContain('secondaryFamilyId');
  });

  it('rejects unknown keys, so status, publishedAt and searchDocument cannot be set by input', () => {
    for (const key of ['status', 'publishedAt', 'searchDocument', 'id', 'createdAt']) {
      expect(productCreateSchema.safeParse({ ...valid, [key]: 'x' }).success, key).toBe(false);
    }
  });

  it('update accepts any subset and the same family rule', () => {
    expect(productUpdateSchema.safeParse({ intensity: 2 }).success).toBe(true);
    expect(productUpdateSchema.safeParse({ brandId: id(9) }).success).toBe(true);
    expect(
      productUpdateSchema.safeParse({ primaryFamilyId: id(3), secondaryFamilyId: id(3) }).success,
    ).toBe(false);
    expect(productUpdateSchema.safeParse({ status: 'published' }).success).toBe(false);
  });
});

describe('variant', () => {
  const valid = { sku: 'DIOR-SAU-100', sizeValue: 100, priceIqd: 150_000 };

  it('accepts a valid variant and upper-cases the SKU', () => {
    expect(variantInputSchema.parse({ ...valid, sku: '  dior-sau-100 ' }).sku).toBe('DIOR-SAU-100');
  });

  it.each([
    ['a one-character SKU', { sku: 'A' }, 'sku'],
    ['a SKU with a space', { sku: 'AB 12' }, 'sku'],
    ['a SKU with Arabic letters', { sku: 'عود-1' }, 'sku'],
    ['a SKU over 40 characters', { sku: 'A'.repeat(41) }, 'sku'],
    ['a size of zero', { sizeValue: 0 }, 'sizeValue'],
    ['a size over 10000', { sizeValue: 10_001 }, 'sizeValue'],
    ['a fractional size', { sizeValue: 12.5 }, 'sizeValue'],
    ['an unknown unit', { sizeUnit: 'kg' }, 'sizeUnit'],
    ['a price of zero', { priceIqd: 0 }, 'priceIqd'],
    ['a negative price', { priceIqd: -1 }, 'priceIqd'],
    ['a fractional price', { priceIqd: 100.5 }, 'priceIqd'],
    ['a price above the ceiling', { priceIqd: MAX_PRICE_IQD + 1 }, 'priceIqd'],
    ['a price written as text', { priceIqd: '150000' }, 'priceIqd'],
    ['a compare-at price equal to the price', { compareAtIqd: 150_000 }, 'compareAtIqd'],
    ['a compare-at price below the price', { compareAtIqd: 100_000 }, 'compareAtIqd'],
  ])('rejects %s', (_label, change, path) => {
    const result = variantInputSchema.safeParse({ ...valid, ...change });
    expect(result.success).toBe(false);
    expect(issues(result)).toContain(path);
  });

  it('accepts a compare-at price above the price', () => {
    expect(variantInputSchema.safeParse({ ...valid, compareAtIqd: 200_000 }).success).toBe(true);
  });

  it('accepts the three size units', () => {
    for (const sizeUnit of ['ml', 'g', 'pcs']) {
      expect(variantInputSchema.safeParse({ ...valid, sizeUnit }).success).toBe(true);
    }
  });

  it('update accepts a subset', () => {
    expect(variantUpdateSchema.safeParse({ priceIqd: 90_000 }).success).toBe(true);
    expect(variantUpdateSchema.safeParse({ productId: id(1) }).success).toBe(false);
  });
});

describe('product links', () => {
  it('notes need a position, default the prominence to 2 and reject a repeated note', () => {
    const parsed = productNotesInputSchema.parse([{ noteId: id(1), position: 'top' }]);
    expect(parsed[0]?.prominence).toBe(2);
    expect(productNotesInputSchema.safeParse([{ noteId: id(1), position: 'middle' }]).success).toBe(
      false,
    );
    expect(
      productNotesInputSchema.safeParse([{ noteId: id(1), position: 'top', prominence: 4 }])
        .success,
    ).toBe(false);
    expect(
      productNotesInputSchema.safeParse([
        { noteId: id(1), position: 'top' },
        { noteId: id(1), position: 'base' },
      ]).success,
    ).toBe(false);
  });

  it('tags and images are unique lists with a ceiling', () => {
    expect(productTagsInputSchema.safeParse([id(1), id(2)]).success).toBe(true);
    expect(productTagsInputSchema.safeParse([id(1), id(1)]).success).toBe(false);
    expect(productTagsInputSchema.safeParse(['nope']).success).toBe(false);

    const images = Array.from({ length: MAX_IMAGES_PER_PRODUCT }, (_, i) => ({
      mediaId: id(i + 1),
    }));
    expect(productImagesInputSchema.safeParse(images).success).toBe(true);
    expect(productImagesInputSchema.safeParse([...images, { mediaId: id(99) }]).success).toBe(
      false,
    );
    expect(productImagesInputSchema.safeParse([images[0], images[0]]).success).toBe(false);
  });

  it('alt text is required and bounded', () => {
    expect(altTextSchema.safeParse('زجاجة عطر على خلفية بيضاء').success).toBe(true);
    expect(altTextSchema.safeParse('   ').success).toBe(false);
    expect(altTextSchema.safeParse('ا'.repeat(301)).success).toBe(false);
  });
});
