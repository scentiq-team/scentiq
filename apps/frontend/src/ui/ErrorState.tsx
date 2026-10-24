import { useI18n } from '@/i18n/I18nProvider';
import { errorCodeOf, isApiError } from '@/services/api/errors';
import { cx } from '@/utils/cx';
import { Button } from './Button';
import { Card } from './Card';

export interface ErrorStateProps {
  /** Anything that was thrown; the message shown depends only on its error code. */
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

/** Shows what went wrong in the shopper's language, with a way to try again. */
export function ErrorState({ error, onRetry, className }: ErrorStateProps) {
  const { t } = useI18n();
  const code = errorCodeOf(error);
  const requestId = isApiError(error) ? error.requestId : undefined;

  return (
    <Card
      role="alert"
      className={cx('flex flex-col items-center gap-3 py-8 text-center', className)}
    >
      <h2 className="text-2xl font-semibold text-ink">{t.errorState.title}</h2>
      <p className="m-0 max-w-prose text-muted">{t.errors[code]}</p>
      {requestId ? (
        <p className="m-0 text-sm text-muted">
          {t.errorState.reference}: <span className="ltr-run">{requestId}</span>
        </p>
      ) : null}
      {onRetry ? (
        <Button variant="secondary" className="mt-2" onClick={onRetry}>
          {t.errorState.retry}
        </Button>
      ) : null}
    </Card>
  );
}
