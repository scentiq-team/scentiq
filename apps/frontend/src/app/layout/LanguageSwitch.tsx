import { localizePath, splitLocale } from '@scentiq/shared';
import { Link, useLocation } from 'react-router';
import { useI18n } from '@/i18n/I18nProvider';

/** Links to the same page in the other language (ADR-0016), keeping the query string. */
export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  const { pathname, search } = useLocation();
  const target = locale === 'ar' ? 'en' : 'ar';
  const { path } = splitLocale(pathname);

  return (
    <Link
      to={`${localizePath(target, path)}${search}`}
      lang={target}
      hrefLang={target}
      aria-label={t.language.switchLabel}
      className={
        className ??
        'inline-flex min-h-11 items-center rounded-control px-3 text-sm text-ink no-underline hover:text-accent'
      }
    >
      {t.language.switchTo}
    </Link>
  );
}
