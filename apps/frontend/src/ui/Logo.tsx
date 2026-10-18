import { BRAND_NAME } from '@scentiq/shared';
import { cx } from '@/utils/cx';

/**
 * The wordmark: "Scent" in the text colour and "IQ" in the brand accent, set in the Latin display
 * face. It is always Latin (it is a name), so it keeps its own direction inside Arabic pages.
 */
export function Logo({ className }: { className?: string }) {
  const iq = BRAND_NAME.slice(-2);
  const scent = BRAND_NAME.slice(0, -2);
  return (
    <span
      dir="ltr"
      lang="en"
      className={cx('tracking-brand font-display text-2xl font-semibold leading-none', className)}
    >
      <span className="text-ink">{scent}</span>
      <span className="text-accent">{iq}</span>
    </span>
  );
}
