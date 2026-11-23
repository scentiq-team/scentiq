// Reference data for `seed:reference` (ADR-0015, ADR-0012): real, production-safe vocabulary the
// catalog is built from. Pure data, no database types, so a test can check it without a database.
//
// FOR REVIEW: the Arabic names below are a first draft written for the Iraqi and Gulf perfume
// market. Hussien reviews them before launch. After launch, staff change names in Studio and the
// seed never overwrites them (it only inserts what is missing, by slug).

import type { TagType } from '@scentiq/shared';

export interface NamedRef {
  /** Latin, lower case, hyphens: used in URLs and as the stable identity of the row. */
  slug: string;
  nameAr: string;
  nameEn: string;
}

// ----- categories (depth 1; gender is an attribute, not a category: ADR-0012) -----

export const CATEGORIES: readonly NamedRef[] = [
  { slug: 'perfumes', nameAr: 'عطور', nameEn: 'Perfumes' },
  { slug: 'oud-and-oud-oil', nameAr: 'عود وزيت عود', nameEn: 'Oud & Oud Oil' },
  {
    slug: 'bakhoor-and-home-fragrance',
    nameAr: 'بخور ومعطرات منزل',
    nameEn: 'Bakhoor & Home Fragrance',
  },
  { slug: 'gift-sets', nameAr: 'أطقم هدايا', nameEn: 'Gift Sets' },
  { slug: 'body-and-hair-mists', nameAr: 'بخاخات جسم وشعر', nameEn: 'Body & Hair Mists' },
];

// ----- olfactive families -----

export const FAMILIES: readonly NamedRef[] = [
  { slug: 'citrus', nameAr: 'حمضي', nameEn: 'Citrus' },
  { slug: 'fresh-aquatic', nameAr: 'منعش بحري', nameEn: 'Fresh & Aquatic' },
  { slug: 'green-aromatic', nameAr: 'عشبي عطري', nameEn: 'Green & Aromatic' },
  { slug: 'floral', nameAr: 'زهري', nameEn: 'Floral' },
  { slug: 'fruity', nameAr: 'فاكهي', nameEn: 'Fruity' },
  { slug: 'gourmand', nameAr: 'حلويات', nameEn: 'Gourmand' },
  { slug: 'spicy', nameAr: 'توابل', nameEn: 'Spicy' },
  { slug: 'woody', nameAr: 'خشبي', nameEn: 'Woody' },
  { slug: 'oud', nameAr: 'عودي', nameEn: 'Oud' },
  { slug: 'amber', nameAr: 'شرقي عنبري', nameEn: 'Amber' },
  { slug: 'musk', nameAr: 'مسكي', nameEn: 'Musky' },
  { slug: 'leather', nameAr: 'جلدي', nameEn: 'Leather' },
  { slug: 'chypre', nameAr: 'شيبر', nameEn: 'Chypre' },
  { slug: 'fougere', nameAr: 'فوجير', nameEn: 'Fougère' },
];

/**
 * Families that smell close to each other (ADR-0011: adjacent = 50%, used by recommendations). Each
 * pair is listed once; the seeder orders the two ids the way the table requires.
 */
export const FAMILY_ADJACENCY: readonly (readonly [string, string])[] = [
  ['citrus', 'fresh-aquatic'],
  ['citrus', 'green-aromatic'],
  ['citrus', 'floral'],
  ['citrus', 'fruity'],
  ['fresh-aquatic', 'green-aromatic'],
  ['fresh-aquatic', 'fougere'],
  ['green-aromatic', 'fougere'],
  ['green-aromatic', 'floral'],
  ['green-aromatic', 'chypre'],
  ['floral', 'fruity'],
  ['floral', 'musk'],
  ['floral', 'chypre'],
  ['floral', 'amber'],
  ['fruity', 'gourmand'],
  ['gourmand', 'amber'],
  ['gourmand', 'spicy'],
  ['spicy', 'amber'],
  ['spicy', 'woody'],
  ['spicy', 'oud'],
  ['woody', 'oud'],
  ['woody', 'amber'],
  ['woody', 'chypre'],
  ['woody', 'leather'],
  ['woody', 'musk'],
  ['woody', 'fougere'],
  ['oud', 'amber'],
  ['oud', 'leather'],
  ['oud', 'musk'],
  ['amber', 'musk'],
  ['amber', 'leather'],
  ['leather', 'chypre'],
];

export const ADJACENCY_WEIGHT_PERCENT = 50;

// ----- notes -----

export const NOTE_GROUPS: readonly NamedRef[] = [
  { slug: 'citrus', nameAr: 'حمضيات', nameEn: 'Citrus' },
  { slug: 'fruity', nameAr: 'فواكه', nameEn: 'Fruits' },
  { slug: 'floral', nameAr: 'أزهار', nameEn: 'Flowers' },
  { slug: 'green', nameAr: 'أعشاب وخضرة', nameEn: 'Green & Herbs' },
  { slug: 'spices', nameAr: 'توابل', nameEn: 'Spices' },
  { slug: 'woods', nameAr: 'أخشاب', nameEn: 'Woods' },
  { slug: 'resins', nameAr: 'راتنجات وبخور', nameEn: 'Resins & Incense' },
  { slug: 'amber-musk', nameAr: 'عنبر ومسك', nameEn: 'Amber & Musk' },
  { slug: 'sweet', nameAr: 'حلويات ومذاقات', nameEn: 'Sweet & Gourmand' },
  { slug: 'leather-tobacco', nameAr: 'جلود وتبغ', nameEn: 'Leather & Tobacco' },
  { slug: 'marine', nameAr: 'نوتات بحرية', nameEn: 'Marine' },
  { slug: 'earthy', nameAr: 'ترابية', nameEn: 'Earthy' },
];

export interface NoteRef extends NamedRef {
  /** Slug of a note group above. */
  group: string;
  /** Other spellings people search with. */
  aliases?: readonly string[];
}

export const NOTES: readonly NoteRef[] = [
  // citrus
  { slug: 'bergamot', group: 'citrus', nameAr: 'برغموت', nameEn: 'Bergamot', aliases: ['برجموت'] },
  { slug: 'lemon', group: 'citrus', nameAr: 'ليمون', nameEn: 'Lemon' },
  { slug: 'orange', group: 'citrus', nameAr: 'برتقال', nameEn: 'Orange' },
  {
    slug: 'mandarin',
    group: 'citrus',
    nameAr: 'يوسفي',
    nameEn: 'Mandarin',
    aliases: ['tangerine'],
  },
  { slug: 'grapefruit', group: 'citrus', nameAr: 'جريب فروت', nameEn: 'Grapefruit' },
  { slug: 'lime', group: 'citrus', nameAr: 'ليمون أخضر', nameEn: 'Lime' },
  { slug: 'neroli', group: 'citrus', nameAr: 'نيرولي', nameEn: 'Neroli' },
  { slug: 'yuzu', group: 'citrus', nameAr: 'يوزو', nameEn: 'Yuzu' },
  // fruits
  { slug: 'apple', group: 'fruity', nameAr: 'تفاح', nameEn: 'Apple' },
  { slug: 'pear', group: 'fruity', nameAr: 'كمثرى', nameEn: 'Pear' },
  { slug: 'peach', group: 'fruity', nameAr: 'خوخ', nameEn: 'Peach' },
  { slug: 'apricot', group: 'fruity', nameAr: 'مشمش', nameEn: 'Apricot' },
  { slug: 'plum', group: 'fruity', nameAr: 'برقوق', nameEn: 'Plum' },
  { slug: 'cherry', group: 'fruity', nameAr: 'كرز', nameEn: 'Cherry' },
  { slug: 'raspberry', group: 'fruity', nameAr: 'توت العليق', nameEn: 'Raspberry' },
  { slug: 'blackcurrant', group: 'fruity', nameAr: 'كشمش أسود', nameEn: 'Blackcurrant' },
  { slug: 'strawberry', group: 'fruity', nameAr: 'فراولة', nameEn: 'Strawberry' },
  { slug: 'pomegranate', group: 'fruity', nameAr: 'رمان', nameEn: 'Pomegranate' },
  { slug: 'fig', group: 'fruity', nameAr: 'تين', nameEn: 'Fig' },
  { slug: 'date', group: 'fruity', nameAr: 'تمر', nameEn: 'Date' },
  { slug: 'pineapple', group: 'fruity', nameAr: 'أناناس', nameEn: 'Pineapple' },
  { slug: 'mango', group: 'fruity', nameAr: 'مانجو', nameEn: 'Mango' },
  { slug: 'lychee', group: 'fruity', nameAr: 'ليتشي', nameEn: 'Lychee' },
  { slug: 'coconut', group: 'fruity', nameAr: 'جوز الهند', nameEn: 'Coconut' },
  // flowers
  { slug: 'rose', group: 'floral', nameAr: 'ورد', nameEn: 'Rose' },
  { slug: 'damask-rose', group: 'floral', nameAr: 'ورد دمشقي', nameEn: 'Damask Rose' },
  { slug: 'taif-rose', group: 'floral', nameAr: 'ورد طائفي', nameEn: 'Taif Rose' },
  { slug: 'jasmine', group: 'floral', nameAr: 'ياسمين', nameEn: 'Jasmine' },
  { slug: 'orange-blossom', group: 'floral', nameAr: 'زهر البرتقال', nameEn: 'Orange Blossom' },
  { slug: 'lavender', group: 'floral', nameAr: 'لافندر', nameEn: 'Lavender', aliases: ['خزامى'] },
  { slug: 'violet', group: 'floral', nameAr: 'بنفسج', nameEn: 'Violet' },
  { slug: 'iris', group: 'floral', nameAr: 'سوسن', nameEn: 'Iris', aliases: ['إيريس'] },
  { slug: 'peony', group: 'floral', nameAr: 'فاوانيا', nameEn: 'Peony' },
  { slug: 'gardenia', group: 'floral', nameAr: 'غاردينيا', nameEn: 'Gardenia' },
  { slug: 'magnolia', group: 'floral', nameAr: 'ماغنوليا', nameEn: 'Magnolia' },
  { slug: 'ylang-ylang', group: 'floral', nameAr: 'يلانغ يلانغ', nameEn: 'Ylang-Ylang' },
  { slug: 'tuberose', group: 'floral', nameAr: 'تيوبروز', nameEn: 'Tuberose' },
  {
    slug: 'lily-of-the-valley',
    group: 'floral',
    nameAr: 'زنبق الوادي',
    nameEn: 'Lily of the Valley',
  },
  { slug: 'osmanthus', group: 'floral', nameAr: 'أوسمانثوس', nameEn: 'Osmanthus' },
  { slug: 'mimosa', group: 'floral', nameAr: 'ميموزا', nameEn: 'Mimosa' },
  // green and herbs
  { slug: 'mint', group: 'green', nameAr: 'نعناع', nameEn: 'Mint' },
  { slug: 'basil', group: 'green', nameAr: 'ريحان', nameEn: 'Basil' },
  { slug: 'green-tea', group: 'green', nameAr: 'شاي أخضر', nameEn: 'Green Tea' },
  { slug: 'sage', group: 'green', nameAr: 'مريمية', nameEn: 'Sage' },
  { slug: 'thyme', group: 'green', nameAr: 'زعتر', nameEn: 'Thyme' },
  { slug: 'rosemary', group: 'green', nameAr: 'إكليل الجبل', nameEn: 'Rosemary' },
  { slug: 'fig-leaf', group: 'green', nameAr: 'ورق التين', nameEn: 'Fig Leaf' },
  { slug: 'green-notes', group: 'green', nameAr: 'نوتات خضراء', nameEn: 'Green Notes' },
  // spices
  { slug: 'cardamom', group: 'spices', nameAr: 'هيل', nameEn: 'Cardamom', aliases: ['cardamon'] },
  { slug: 'cinnamon', group: 'spices', nameAr: 'قرفة', nameEn: 'Cinnamon' },
  { slug: 'clove', group: 'spices', nameAr: 'قرنفل', nameEn: 'Clove' },
  { slug: 'black-pepper', group: 'spices', nameAr: 'فلفل أسود', nameEn: 'Black Pepper' },
  { slug: 'pink-pepper', group: 'spices', nameAr: 'فلفل وردي', nameEn: 'Pink Pepper' },
  { slug: 'nutmeg', group: 'spices', nameAr: 'جوزة الطيب', nameEn: 'Nutmeg' },
  { slug: 'saffron', group: 'spices', nameAr: 'زعفران', nameEn: 'Saffron' },
  { slug: 'ginger', group: 'spices', nameAr: 'زنجبيل', nameEn: 'Ginger' },
  { slug: 'coriander', group: 'spices', nameAr: 'كزبرة', nameEn: 'Coriander' },
  { slug: 'star-anise', group: 'spices', nameAr: 'يانسون نجمي', nameEn: 'Star Anise' },
  // woods
  {
    slug: 'oud',
    group: 'woods',
    nameAr: 'عود',
    nameEn: 'Oud',
    aliases: ['oudh', 'aoud', 'agarwood', 'oud wood'],
  },
  { slug: 'sandalwood', group: 'woods', nameAr: 'صندل', nameEn: 'Sandalwood' },
  { slug: 'cedar', group: 'woods', nameAr: 'خشب الأرز', nameEn: 'Cedar', aliases: ['cedarwood'] },
  { slug: 'cypress', group: 'woods', nameAr: 'سرو', nameEn: 'Cypress' },
  { slug: 'rosewood', group: 'woods', nameAr: 'خشب الورد', nameEn: 'Rosewood' },
  { slug: 'guaiac-wood', group: 'woods', nameAr: 'خشب الغاياك', nameEn: 'Guaiac Wood' },
  // resins and incense
  {
    slug: 'frankincense',
    group: 'resins',
    nameAr: 'لبان',
    nameEn: 'Frankincense',
    aliases: ['luban', 'olibanum'],
  },
  { slug: 'myrrh', group: 'resins', nameAr: 'مرّ', nameEn: 'Myrrh' },
  { slug: 'benzoin', group: 'resins', nameAr: 'جاوي', nameEn: 'Benzoin' },
  { slug: 'labdanum', group: 'resins', nameAr: 'لبدن', nameEn: 'Labdanum' },
  {
    slug: 'incense',
    group: 'resins',
    nameAr: 'بخور',
    nameEn: 'Incense',
    aliases: ['bakhoor', 'bukhoor'],
  },
  // amber and musk
  { slug: 'amber', group: 'amber-musk', nameAr: 'عنبر', nameEn: 'Amber' },
  { slug: 'musk', group: 'amber-musk', nameAr: 'مسك', nameEn: 'Musk' },
  { slug: 'white-musk', group: 'amber-musk', nameAr: 'مسك أبيض', nameEn: 'White Musk' },
  // sweet and gourmand
  { slug: 'vanilla', group: 'sweet', nameAr: 'فانيلا', nameEn: 'Vanilla' },
  { slug: 'tonka-bean', group: 'sweet', nameAr: 'فول التونكا', nameEn: 'Tonka Bean' },
  { slug: 'caramel', group: 'sweet', nameAr: 'كراميل', nameEn: 'Caramel' },
  { slug: 'honey', group: 'sweet', nameAr: 'عسل', nameEn: 'Honey' },
  { slug: 'chocolate', group: 'sweet', nameAr: 'شوكولاتة', nameEn: 'Chocolate' },
  { slug: 'cocoa', group: 'sweet', nameAr: 'كاكاو', nameEn: 'Cocoa' },
  { slug: 'coffee', group: 'sweet', nameAr: 'قهوة', nameEn: 'Coffee' },
  { slug: 'almond', group: 'sweet', nameAr: 'لوز', nameEn: 'Almond' },
  // leather and tobacco
  { slug: 'leather', group: 'leather-tobacco', nameAr: 'جلد', nameEn: 'Leather' },
  { slug: 'suede', group: 'leather-tobacco', nameAr: 'سويد', nameEn: 'Suede' },
  { slug: 'tobacco', group: 'leather-tobacco', nameAr: 'تبغ', nameEn: 'Tobacco' },
  // marine
  {
    slug: 'sea-notes',
    group: 'marine',
    nameAr: 'نوتات بحرية',
    nameEn: 'Sea Notes',
    aliases: ['marine notes'],
  },
  { slug: 'sea-salt', group: 'marine', nameAr: 'ملح البحر', nameEn: 'Sea Salt' },
  // earthy
  { slug: 'patchouli', group: 'earthy', nameAr: 'باتشولي', nameEn: 'Patchouli' },
  { slug: 'vetiver', group: 'earthy', nameAr: 'فيتيفر', nameEn: 'Vetiver' },
  { slug: 'oakmoss', group: 'earthy', nameAr: 'طحلب البلوط', nameEn: 'Oakmoss' },
];

// ----- tags: a controlled vocabulary (ADR-0012). Gender and concentration are attributes, not tags. -----

export interface TagRef extends NamedRef {
  type: TagType;
}

export const TAGS: readonly TagRef[] = [
  // occasion
  { type: 'occasion', slug: 'daily-wear', nameAr: 'للاستخدام اليومي', nameEn: 'Daily Wear' },
  { type: 'occasion', slug: 'office', nameAr: 'للعمل', nameEn: 'Office' },
  { type: 'occasion', slug: 'evening', nameAr: 'للمساء', nameEn: 'Evening' },
  { type: 'occasion', slug: 'special-occasions', nameAr: 'للمناسبات', nameEn: 'Special Occasions' },
  { type: 'occasion', slug: 'wedding', nameAr: 'للأعراس', nameEn: 'Weddings' },
  { type: 'occasion', slug: 'eid', nameAr: 'للعيد', nameEn: 'Eid' },
  { type: 'occasion', slug: 'gift', nameAr: 'للإهداء', nameEn: 'Gifting' },
  // season
  { type: 'season', slug: 'spring', nameAr: 'الربيع', nameEn: 'Spring' },
  { type: 'season', slug: 'summer', nameAr: 'الصيف', nameEn: 'Summer' },
  { type: 'season', slug: 'autumn', nameAr: 'الخريف', nameEn: 'Autumn' },
  { type: 'season', slug: 'winter', nameAr: 'الشتاء', nameEn: 'Winter' },
  { type: 'season', slug: 'all-year', nameAr: 'كل الفصول', nameEn: 'All Year' },
  // mood
  { type: 'mood', slug: 'fresh', nameAr: 'منعش', nameEn: 'Fresh' },
  { type: 'mood', slug: 'romantic', nameAr: 'رومانسي', nameEn: 'Romantic' },
  { type: 'mood', slug: 'bold', nameAr: 'جريء', nameEn: 'Bold' },
  { type: 'mood', slug: 'calm', nameAr: 'هادئ', nameEn: 'Calm' },
  { type: 'mood', slug: 'elegant', nameAr: 'أنيق', nameEn: 'Elegant' },
  { type: 'mood', slug: 'warm', nameAr: 'دافئ', nameEn: 'Warm' },
  // feature
  { type: 'feature', slug: 'long-lasting', nameAr: 'ثبات عالٍ', nameEn: 'Long Lasting' },
  { type: 'feature', slug: 'strong-sillage', nameAr: 'انتشار قوي', nameEn: 'Strong Sillage' },
  { type: 'feature', slug: 'alcohol-free', nameAr: 'خالٍ من الكحول', nameEn: 'Alcohol Free' },
  { type: 'feature', slug: 'travel-size', nameAr: 'حجم سفر', nameEn: 'Travel Size' },
];
