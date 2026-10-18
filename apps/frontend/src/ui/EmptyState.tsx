import type { ReactNode } from 'react';
import { cx } from '@/utils/cx';
import { Card } from './Card';
import { BottleIcon } from './icons';

export interface EmptyStateProps {
  title: string;
  description: string;
  /** A useful next step (quality gate: every empty state offers one when one exists). */
  action?: ReactNode;
  icon?: ReactNode;
  /** Pick the level that fits the page outline (2 under the page title, 1 for a whole page). */
  headingLevel?: 1 | 2 | 3;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  headingLevel = 2,
  className,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <Card className={cx('flex flex-col items-center gap-4 py-10 text-center', className)}>
      <span className="grid size-14 place-items-center rounded-full border border-line text-accent">
        {icon ?? <BottleIcon width={28} height={28} />}
      </span>
      <div className="flex max-w-prose flex-col gap-2">
        <Heading className="text-2xl font-semibold text-ink">{title}</Heading>
        <p className="m-0 text-muted">{description}</p>
      </div>
      {action ? <div className="mt-2 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </Card>
  );
}
