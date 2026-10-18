import type { ComponentPropsWithoutRef } from 'react';
import { cx } from '@/utils/cx';

type CardProps = ComponentPropsWithoutRef<'div'> & { as?: 'div' | 'section' | 'article' };

export function Card({ as: Tag = 'div', className, ...rest }: CardProps) {
  return (
    <Tag className={cx('rounded-card border border-line bg-surface p-6', className)} {...rest} />
  );
}
