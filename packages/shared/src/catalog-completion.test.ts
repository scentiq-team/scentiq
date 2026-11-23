import { describe, expect, it } from 'vitest';
import {
  computeProductCompletion,
  OPTIONAL_COMPLETION_KEYS,
  type ProductCompletionInput,
  REQUIRED_COMPLETION_KEYS,
} from './catalog-completion.js';
import { MIN_NOTES_TO_PUBLISH } from './catalog-constants.js';

const publishable: ProductCompletionInput = {
  nameAr: 'عود ملكي',
  brandId: 'brand-1',
  categoryId: 'category-1',
  primaryFamilyId: 'family-1',
  descriptionAr: 'وصف',
  seoTitleAr: 'عنوان',
  seoDescriptionAr: 'وصف قصير',
  noteCount: MIN_NOTES_TO_PUBLISH,
  liveVariantCount: 1,
  imageCount: 1,
  imagesWithAltCount: 1,
  tagCount: 0,
};

const full: ProductCompletionInput = {
  ...publishable,
  nameEn: 'Royal Oud',
  descriptionEn: 'Description',
  concentration: 'edp',
  intensity: 3,
  imageCount: 3,
  tagCount: 2,
};

const empty: ProductCompletionInput = {
  noteCount: 0,
  liveVariantCount: 0,
  imageCount: 0,
  imagesWithAltCount: 0,
  tagCount: 0,
};

describe('computeProductCompletion', () => {
  it('scores 100 when everything is filled in', () => {
    const result = computeProductCompletion(full);
    expect(result.score).toBe(100);
    expect(result.canPublish).toBe(true);
    expect(result.missingRequired).toEqual([]);
  });

  it('scores 0 for an empty product and lists every required check as missing', () => {
    const result = computeProductCompletion(empty);
    expect(result.score).toBe(0);
    expect(result.canPublish).toBe(false);
    expect(result.missingRequired).toEqual([...REQUIRED_COMPLETION_KEYS]);
  });

  it('weights add up to exactly 100', () => {
    const total = computeProductCompletion(empty).checks.reduce((sum, c) => sum + c.weight, 0);
    expect(total).toBe(100);
  });

  it('a product with only the required fields can be published and scores 80', () => {
    const result = computeProductCompletion(publishable);
    expect(result.canPublish).toBe(true);
    expect(result.score).toBe(80);
  });

  it('reports each required check on its own: removing one blocks publishing and names it', () => {
    const removals: [string, Partial<ProductCompletionInput>][] = [
      ['name_ar', { nameAr: '' }],
      ['brand', { brandId: null }],
      ['category', { categoryId: null }],
      ['primary_family', { primaryFamilyId: undefined }],
      ['notes', { noteCount: MIN_NOTES_TO_PUBLISH - 1 }],
      ['variant', { liveVariantCount: 0 }],
      ['image_with_alt', { imagesWithAltCount: 0 }],
      ['description_ar', { descriptionAr: '   ' }],
      ['seo_title_ar', { seoTitleAr: null }],
      ['seo_description_ar', { seoDescriptionAr: '' }],
    ];
    // Every required key is covered by exactly one removal.
    expect(removals.map(([key]) => key).sort()).toEqual([...REQUIRED_COMPLETION_KEYS].sort());
    for (const [key, change] of removals) {
      const result = computeProductCompletion({ ...full, ...change });
      expect(result.canPublish, key).toBe(false);
      expect(result.missingRequired, key).toEqual([key]);
      expect(result.score, key).toBe(92);
    }
  });

  it('optional checks add points but never block publishing', () => {
    for (const key of OPTIONAL_COMPLETION_KEYS) {
      const check = computeProductCompletion(publishable).checks.find((c) => c.key === key);
      expect(check?.required).toBe(false);
      expect(check?.passed).toBe(false);
    }
    expect(computeProductCompletion(publishable).canPublish).toBe(true);
  });

  it('treats whitespace-only text as missing', () => {
    const result = computeProductCompletion({ ...full, descriptionAr: ' \n\t ', nameEn: '  ' });
    expect(result.missingRequired).toEqual(['description_ar']);
    expect(result.checks.find((c) => c.key === 'name_en')?.passed).toBe(false);
  });

  it('counts an intensity of zero as filled only when it is a number', () => {
    expect(
      computeProductCompletion({ ...full, intensity: null }).checks.find(
        (c) => c.key === 'intensity',
      )?.passed,
    ).toBe(false);
    expect(
      computeProductCompletion({ ...full, intensity: 1 }).checks.find((c) => c.key === 'intensity')
        ?.passed,
    ).toBe(true);
  });

  it('wants two images for the gallery check, and an alt text for the required one', () => {
    const one = computeProductCompletion({ ...full, imageCount: 1 });
    expect(one.checks.find((c) => c.key === 'gallery')?.passed).toBe(false);
    expect(one.canPublish).toBe(true);
    const noAlt = computeProductCompletion({ ...full, imagesWithAltCount: 0 });
    expect(noAlt.missingRequired).toEqual(['image_with_alt']);
  });

  it('uses the same note minimum as the database gate', () => {
    expect(MIN_NOTES_TO_PUBLISH).toBe(3);
    expect(computeProductCompletion({ ...full, noteCount: 2 }).canPublish).toBe(false);
    expect(computeProductCompletion({ ...full, noteCount: 3 }).canPublish).toBe(true);
  });
});
