import { BRAND_COPY, BRAND_NAME } from '@scentiq/shared';
import { useI18n } from '@/i18n/I18nProvider';
import { Container } from '@/ui/Container';
import { Logo } from '@/ui/Logo';

export function SiteFooter() {
  const { locale, t } = useI18n();
  return (
    <footer className="border-t border-line bg-surface">
      <Container className="flex flex-col gap-4 py-10 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <Logo />
          <p className="m-0 text-sm text-muted">{BRAND_COPY[locale].tagline}</p>
        </div>
        <p className="m-0 text-sm text-muted">
          © <span className="ltr-run">{new Date().getFullYear()}</span> {BRAND_NAME}.{' '}
          {t.footer.rights}
        </p>
      </Container>
    </footer>
  );
}
