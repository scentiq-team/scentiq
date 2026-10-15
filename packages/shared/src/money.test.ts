import { describe, expect, it } from 'vitest';
import { formatIqd } from './money.js';

describe('formatIqd', () => {
  it('formats whole dinars with Western digits and grouping', () => {
    expect(formatIqd(100000, 'en')).toBe('IQD 100,000');
    expect(formatIqd(100000, 'ar')).toBe('100,000 د.ع');
    expect(formatIqd(0, 'en')).toBe('IQD 0');
    expect(formatIqd(1250, 'ar')).toBe('1,250 د.ع');
  });

  it('never outputs Arabic-Indic digits', () => {
    expect(formatIqd(987654321, 'ar')).toMatch(/^[0-9,]+ د\.ع$/);
  });

  it('rejects fractions, negatives and unsafe numbers', () => {
    expect(() => formatIqd(10.5, 'en')).toThrow(RangeError);
    expect(() => formatIqd(-1, 'en')).toThrow(RangeError);
    expect(() => formatIqd(Number.NaN, 'en')).toThrow(RangeError);
    expect(() => formatIqd(Number.MAX_SAFE_INTEGER + 1, 'en')).toThrow(RangeError);
  });
});
