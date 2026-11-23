// Sample catalog for `seed:dev` (ADR-0015): invented brands and products so the storefront and Studio
// have something realistic to show in development and staging. NOTHING here is real:
//   - the brands and perfumes are invented (any resemblance to a real name is a coincidence)
//   - every description says it is sample data
//   - there are no reviews, ratings, sales figures, "before" prices or stock-scarcity claims
// Every row inserted from this file is recorded in `sample_data_registry`, which makes production
// refuse to start if any of it ever leaks there.

import type { Concentration, Gender, NotePosition, SizeUnit } from '@scentiq/shared';

export interface DevBrand {
  slug: string;
  nameAr: string;
  nameEn: string;
  countryCode: string;
}

const SAMPLE_STORY_AR = 'علامة تجريبية من بيانات العينة، لا تمثل علامة حقيقية.';
const SAMPLE_STORY_EN = 'A sample brand from development data. It does not represent a real brand.';

export const DEV_BRANDS: readonly DevBrand[] = [
  { slug: 'dar-dijla', nameAr: 'دار دجلة', nameEn: 'Dar Dijla', countryCode: 'IQ' },
  { slug: 'maison-aurelle', nameAr: 'ميزون أوريل', nameEn: 'Maison Aurelle', countryCode: 'FR' },
  { slug: 'sumer-atelier', nameAr: 'مشغل سومر', nameEn: 'Sumer Atelier', countryCode: 'IQ' },
  {
    slug: 'sahra-oud-house',
    nameAr: 'بيت عود الصحراء',
    nameEn: 'Sahra Oud House',
    countryCode: 'AE',
  },
  { slug: 'albion-and-vale', nameAr: 'ألبيون آند فيل', nameEn: 'Albion & Vale', countryCode: 'GB' },
];

export const devBrandStory = { ar: SAMPLE_STORY_AR, en: SAMPLE_STORY_EN };

export interface DevNote {
  slug: string;
  position: NotePosition;
  prominence: 1 | 2 | 3;
}

export interface DevVariant {
  sku: string;
  size: number;
  unit?: SizeUnit;
  priceIqd: number;
}

export type DevStatus = 'published' | 'draft' | 'archived';

export interface DevProduct {
  brand: string;
  category: string;
  nameAr: string;
  nameEn: string;
  gender: Gender;
  concentration?: Concentration;
  intensity?: 1 | 2 | 3 | 4 | 5;
  family: string;
  secondaryFamily?: string;
  notes: readonly DevNote[];
  tags: readonly string[];
  variants: readonly DevVariant[];
  /** How many placeholder photos to attach (0 leaves a draft without an image on purpose). */
  images: number;
  status: DevStatus;
  /** Why a draft is incomplete: shown in the report so Studio's completion score has examples. */
  note?: string;
}

const n = (slug: string, position: NotePosition, prominence: 1 | 2 | 3 = 2): DevNote => ({
  slug,
  position,
  prominence,
});

export const DEV_PRODUCTS: readonly DevProduct[] = [
  // ----- perfumes -----
  {
    brand: 'dar-dijla',
    category: 'perfumes',
    nameAr: 'ليالي دجلة',
    nameEn: 'Dijla Nights',
    gender: 'unisex',
    concentration: 'edp',
    intensity: 4,
    family: 'oud',
    secondaryFamily: 'amber',
    notes: [
      n('saffron', 'top'),
      n('taif-rose', 'heart', 2),
      n('oud', 'base', 3),
      n('amber', 'base', 2),
    ],
    tags: ['evening', 'winter', 'long-lasting', 'warm'],
    variants: [
      { sku: 'DJL-NIGHTS-50', size: 50, priceIqd: 145_000 },
      { sku: 'DJL-NIGHTS-100', size: 100, priceIqd: 235_000 },
    ],
    images: 2,
    status: 'published',
  },
  {
    brand: 'maison-aurelle',
    category: 'perfumes',
    nameAr: 'ساحة العنبر',
    nameEn: 'Amber Court',
    gender: 'unisex',
    concentration: 'edp',
    intensity: 3,
    family: 'amber',
    secondaryFamily: 'gourmand',
    notes: [
      n('bergamot', 'top'),
      n('cardamom', 'top', 1),
      n('vanilla', 'base', 3),
      n('amber', 'base', 3),
      n('tonka-bean', 'base'),
    ],
    tags: ['evening', 'autumn', 'winter', 'warm'],
    variants: [
      { sku: 'AUR-COURT-50', size: 50, priceIqd: 120_000 },
      { sku: 'AUR-COURT-100', size: 100, priceIqd: 195_000 },
    ],
    images: 2,
    status: 'published',
  },
  {
    brand: 'maison-aurelle',
    category: 'perfumes',
    nameAr: 'صباح الحمضيات',
    nameEn: 'Citrus Morning',
    gender: 'unisex',
    concentration: 'edt',
    intensity: 2,
    family: 'citrus',
    secondaryFamily: 'fresh-aquatic',
    notes: [
      n('bergamot', 'top', 3),
      n('lemon', 'top'),
      n('neroli', 'heart'),
      n('white-musk', 'base', 1),
    ],
    tags: ['daily-wear', 'office', 'summer', 'spring', 'fresh'],
    variants: [
      { sku: 'AUR-CITRUS-50', size: 50, priceIqd: 85_000 },
      { sku: 'AUR-CITRUS-100', size: 100, priceIqd: 135_000 },
    ],
    images: 1,
    status: 'published',
  },
  {
    brand: 'dar-dijla',
    category: 'perfumes',
    nameAr: 'فانوس الورد',
    nameEn: 'Rose Lantern',
    gender: 'women',
    concentration: 'edp',
    intensity: 3,
    family: 'floral',
    secondaryFamily: 'musk',
    notes: [
      n('pink-pepper', 'top', 1),
      n('taif-rose', 'heart', 3),
      n('jasmine', 'heart'),
      n('white-musk', 'base', 2),
      n('sandalwood', 'base', 1),
    ],
    tags: ['special-occasions', 'romantic', 'spring', 'elegant'],
    variants: [
      { sku: 'DJL-ROSE-50', size: 50, priceIqd: 135_000 },
      { sku: 'DJL-ROSE-100', size: 100, priceIqd: 215_000 },
    ],
    images: 1,
    status: 'published',
  },
  {
    brand: 'albion-and-vale',
    category: 'perfumes',
    nameAr: 'بستان أخضر',
    nameEn: 'Green Orchard',
    gender: 'unisex',
    concentration: 'edt',
    intensity: 2,
    family: 'green-aromatic',
    secondaryFamily: 'fruity',
    notes: [
      n('apple', 'top'),
      n('mint', 'top'),
      n('fig-leaf', 'heart'),
      n('cedar', 'base'),
      n('vetiver', 'base', 1),
    ],
    tags: ['daily-wear', 'summer', 'fresh'],
    variants: [{ sku: 'ALB-ORCHARD-100', size: 100, priceIqd: 110_000 }],
    images: 0,
    status: 'draft',
    note: 'No image yet: a draft that cannot be published.',
  },
  {
    brand: 'albion-and-vale',
    category: 'perfumes',
    nameAr: 'جلد الليل',
    nameEn: 'Night Leather',
    gender: 'men',
    concentration: 'edp',
    intensity: 4,
    family: 'leather',
    secondaryFamily: 'woody',
    notes: [
      n('black-pepper', 'top'),
      n('suede', 'heart'),
      n('leather', 'heart', 3),
      n('tobacco', 'base'),
      n('patchouli', 'base', 2),
      n('amber', 'base', 1),
    ],
    tags: ['evening', 'autumn', 'winter', 'bold'],
    variants: [
      { sku: 'ALB-LEATHER-50', size: 50, priceIqd: 150_000 },
      { sku: 'ALB-LEATHER-100', size: 100, priceIqd: 240_000 },
    ],
    images: 1,
    status: 'published',
  },
  {
    brand: 'sumer-atelier',
    category: 'perfumes',
    nameAr: 'حدائق سومر',
    nameEn: 'Sumer Gardens',
    gender: 'women',
    concentration: 'edp',
    intensity: 3,
    family: 'floral',
    secondaryFamily: 'fruity',
    notes: [
      n('pear', 'top'),
      n('peach', 'top', 1),
      n('peony', 'heart', 2),
      n('jasmine', 'heart'),
      n('white-musk', 'base'),
    ],
    tags: ['daily-wear', 'spring', 'summer', 'romantic'],
    variants: [
      { sku: 'SUM-GARDENS-50', size: 50, priceIqd: 125_000 },
      { sku: 'SUM-GARDENS-100', size: 100, priceIqd: 200_000 },
    ],
    images: 1,
    status: 'published',
  },
  {
    brand: 'sahra-oud-house',
    category: 'perfumes',
    nameAr: 'زعفران الصحراء',
    nameEn: 'Desert Saffron',
    gender: 'unisex',
    concentration: 'parfum',
    intensity: 5,
    family: 'spicy',
    secondaryFamily: 'oud',
    notes: [
      n('saffron', 'top', 3),
      n('cardamom', 'top'),
      n('oud', 'heart', 2),
      n('myrrh', 'base'),
      n('amber', 'base', 2),
    ],
    tags: ['special-occasions', 'wedding', 'winter', 'long-lasting', 'strong-sillage'],
    variants: [
      { sku: 'SAH-SAFFRON-50', size: 50, priceIqd: 260_000 },
      { sku: 'SAH-SAFFRON-100', size: 100, priceIqd: 410_000 },
    ],
    images: 2,
    status: 'published',
  },
  {
    brand: 'albion-and-vale',
    category: 'perfumes',
    nameAr: 'أرز وملح',
    nameEn: 'Cedar & Salt',
    gender: 'men',
    concentration: 'edt',
    intensity: 3,
    family: 'woody',
    secondaryFamily: 'fresh-aquatic',
    notes: [
      n('bergamot', 'top'),
      n('sage', 'top', 1),
      n('sea-salt', 'heart'),
      n('cedar', 'base', 3),
      n('vetiver', 'base'),
    ],
    tags: ['daily-wear', 'office', 'summer', 'fresh'],
    variants: [
      { sku: 'ALB-CEDAR-50', size: 50, priceIqd: 95_000 },
      { sku: 'ALB-CEDAR-100', size: 100, priceIqd: 150_000 },
    ],
    images: 1,
    status: 'published',
  },
  {
    brand: 'sumer-atelier',
    category: 'perfumes',
    nameAr: 'تمر مخملي',
    nameEn: 'Velvet Date',
    gender: 'unisex',
    concentration: 'edp',
    intensity: 3,
    family: 'gourmand',
    secondaryFamily: 'amber',
    notes: [
      n('cinnamon', 'top', 1),
      n('date', 'heart', 3),
      n('almond', 'heart'),
      n('vanilla', 'base', 2),
      n('tonka-bean', 'base'),
    ],
    tags: ['evening', 'autumn', 'winter', 'warm'],
    variants: [{ sku: 'SUM-DATE-100', size: 100, priceIqd: 160_000 }],
    images: 1,
    status: 'archived',
    note: 'Published, then archived: shows how an archived product behaves.',
  },
  {
    brand: 'maison-aurelle',
    category: 'perfumes',
    nameAr: 'سوسن حريري',
    nameEn: 'Silk Iris',
    gender: 'women',
    concentration: 'parfum',
    intensity: 3,
    family: 'floral',
    secondaryFamily: 'chypre',
    // Only two notes on purpose: a published product needs three.
    notes: [n('iris', 'heart', 3), n('violet', 'heart', 2)],
    tags: ['special-occasions', 'elegant'],
    variants: [{ sku: 'AUR-IRIS-50', size: 50, priceIqd: 185_000 }],
    images: 1,
    status: 'draft',
    note: 'Only two notes: a draft that cannot be published.',
  },
  // ----- oud and oud oil -----
  {
    brand: 'sahra-oud-house',
    category: 'oud-and-oud-oil',
    nameAr: 'دهن عود ملكي',
    nameEn: 'Royal Oud Oil',
    gender: 'unisex',
    concentration: 'oil',
    intensity: 5,
    family: 'oud',
    notes: [
      n('oud', 'heart', 3),
      n('sandalwood', 'base', 2),
      n('amber', 'base'),
      n('rose', 'top', 1),
    ],
    tags: ['special-occasions', 'gift', 'long-lasting', 'strong-sillage', 'alcohol-free'],
    variants: [
      { sku: 'SAH-OILROYAL-3', size: 3, priceIqd: 150_000 },
      { sku: 'SAH-OILROYAL-12', size: 12, priceIqd: 520_000 },
    ],
    images: 2,
    status: 'published',
  },
  {
    brand: 'sahra-oud-house',
    category: 'oud-and-oud-oil',
    nameAr: 'عود مدخّن',
    nameEn: 'Smoked Oud',
    gender: 'unisex',
    concentration: 'parfum',
    intensity: 5,
    family: 'oud',
    secondaryFamily: 'leather',
    notes: [
      n('incense', 'top'),
      n('oud', 'heart', 3),
      n('leather', 'heart'),
      n('labdanum', 'base', 2),
    ],
    tags: ['evening', 'winter', 'bold', 'long-lasting'],
    variants: [{ sku: 'SAH-SMOKED-50', size: 50, priceIqd: 330_000 }],
    images: 1,
    status: 'published',
  },
  {
    brand: 'dar-dijla',
    category: 'oud-and-oud-oil',
    nameAr: 'عود وورد',
    nameEn: 'Oud & Rose',
    gender: 'unisex',
    concentration: 'oil',
    intensity: 4,
    family: 'oud',
    secondaryFamily: 'floral',
    notes: [n('taif-rose', 'top', 2), n('oud', 'heart', 3), n('musk', 'base')],
    tags: ['wedding', 'gift', 'alcohol-free', 'long-lasting'],
    variants: [
      { sku: 'DJL-OUDROSE-3', size: 3, priceIqd: 120_000 },
      { sku: 'DJL-OUDROSE-12', size: 12, priceIqd: 410_000 },
    ],
    images: 1,
    status: 'published',
  },
  // ----- bakhoor and home fragrance -----
  {
    brand: 'dar-dijla',
    category: 'bakhoor-and-home-fragrance',
    nameAr: 'بخور المجلس',
    nameEn: 'Majlis Bakhoor',
    gender: 'unisex',
    family: 'oud',
    secondaryFamily: 'amber',
    notes: [
      n('incense', 'top', 2),
      n('oud', 'heart', 2),
      n('sandalwood', 'heart'),
      n('amber', 'base'),
      n('musk', 'base', 1),
    ],
    tags: ['eid', 'gift', 'warm'],
    variants: [
      { sku: 'DJL-BAKHOOR-50', size: 50, unit: 'g', priceIqd: 35_000 },
      { sku: 'DJL-BAKHOOR-100', size: 100, unit: 'g', priceIqd: 60_000 },
    ],
    images: 1,
    status: 'published',
  },
  {
    brand: 'albion-and-vale',
    category: 'bakhoor-and-home-fragrance',
    nameAr: 'معطر منزل لافندر',
    nameEn: 'Lavender Home Mist',
    gender: 'unisex',
    family: 'green-aromatic',
    notes: [n('lavender', 'top', 3), n('sage', 'heart'), n('cedar', 'base', 1)],
    tags: ['calm', 'all-year'],
    variants: [],
    images: 1,
    status: 'draft',
    note: 'No variant yet: a draft without a price.',
  },
  // ----- gift sets -----
  {
    brand: 'maison-aurelle',
    category: 'gift-sets',
    nameAr: 'طقم الاستكشاف',
    nameEn: 'Discovery Set',
    gender: 'unisex',
    family: 'citrus',
    secondaryFamily: 'amber',
    notes: [
      n('bergamot', 'top'),
      n('vanilla', 'base'),
      n('amber', 'base'),
      n('white-musk', 'base', 1),
    ],
    tags: ['gift', 'travel-size', 'eid'],
    variants: [{ sku: 'AUR-DISCOVERY-5', size: 5, unit: 'pcs', priceIqd: 99_000 }],
    images: 1,
    status: 'published',
  },
  // ----- body and hair mists -----
  {
    brand: 'dar-dijla',
    category: 'body-and-hair-mists',
    nameAr: 'بخاخ شعر الورد',
    nameEn: 'Rose Hair Mist',
    gender: 'women',
    family: 'floral',
    secondaryFamily: 'musk',
    notes: [n('peach', 'top', 1), n('rose', 'heart', 3), n('white-musk', 'base', 2)],
    tags: ['daily-wear', 'spring', 'romantic'],
    variants: [
      { sku: 'DJL-HAIRROSE-100', size: 100, priceIqd: 22_000 },
      { sku: 'DJL-HAIRROSE-250', size: 250, priceIqd: 45_000 },
    ],
    images: 1,
    status: 'published',
  },
  {
    brand: 'maison-aurelle',
    category: 'body-and-hair-mists',
    nameAr: 'بخاخ جسم قطني',
    nameEn: 'Cotton Body Mist',
    gender: 'unisex',
    family: 'musk',
    secondaryFamily: 'fresh-aquatic',
    notes: [n('lime', 'top', 1), n('lily-of-the-valley', 'heart'), n('white-musk', 'base', 3)],
    tags: ['daily-wear', 'summer', 'fresh', 'travel-size'],
    variants: [
      { sku: 'AUR-COTTON-100', size: 100, priceIqd: 18_000 },
      { sku: 'AUR-COTTON-250', size: 250, priceIqd: 38_000 },
    ],
    images: 1,
    status: 'published',
  },
  {
    brand: 'sumer-atelier',
    category: 'body-and-hair-mists',
    nameAr: 'بخاخ جسم عنبري',
    nameEn: 'Amber Body Mist',
    gender: 'unisex',
    family: 'amber',
    secondaryFamily: 'gourmand',
    notes: [
      n('mandarin', 'top', 1),
      n('vanilla', 'heart', 2),
      n('amber', 'base', 3),
      n('caramel', 'base', 1),
    ],
    tags: ['evening', 'autumn', 'winter', 'warm'],
    variants: [
      { sku: 'SUM-AMBERMIST-100', size: 100, priceIqd: 25_000 },
      { sku: 'SUM-AMBERMIST-250', size: 250, priceIqd: 52_000 },
    ],
    images: 1,
    status: 'published',
  },
];
