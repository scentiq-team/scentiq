import type { Locale } from '@scentiq/shared';
import { I18nProvider, useDocumentLocale } from '@/i18n/I18nProvider';
import { SiteLayout } from './SiteLayout';

/** One instance per language: sets the dictionary, <html lang dir>, and the storefront frame. */
export function LocaleLayout({ locale }: { locale: Locale }) {
  useDocumentLocale(locale);
  return (
    <I18nProvider locale={locale}>
      <SiteLayout />
    </I18nProvider>
  );
}
