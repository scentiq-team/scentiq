// Money is always whole Iraqi dinars stored as integers (ADR-0004). Prices are displayed with
// Western digits in both languages (ADR-0016): "100,000 د.ع" in Arabic, "IQD 100,000" in English.
import type { Locale } from './locale.js';

export const CURRENCY_CODE = 'IQD';

const GROUPING = new Intl.NumberFormat('en-US', { useGrouping: true, maximumFractionDigits: 0 });

export function formatIqd(amount: number, locale: Locale): string {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new RangeError('IQD amounts must be whole, non-negative dinars');
  }
  const digits = GROUPING.format(amount);
  return locale === 'ar' ? `${digits} د.ع` : `${CURRENCY_CODE} ${digits}`;
}
