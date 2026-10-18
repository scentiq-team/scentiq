import { cx } from '@/utils/cx';

/**
 * A placeholder block shown while data loads. It is decorative (hidden from assistive
 * technology); the region that contains it announces the loading state with role="status".
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('skeleton rounded-control', className)} />;
}
