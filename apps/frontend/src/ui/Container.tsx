import type { ComponentPropsWithoutRef } from 'react';
import { cx } from '@/utils/cx';

/** Page-width wrapper: 16px gutter on phones, wider on larger screens, never overflowing. */
export function Container({ className, ...rest }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cx('mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8', className)} {...rest} />;
}
