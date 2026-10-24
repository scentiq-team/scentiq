// Perfume Studio placeholder. It is loaded lazily (its own chunk) so shoppers never download it,
// and it lives outside the storefront layout. Sign-in and the real screens arrive in Phases 2 and 7.
import { BRAND_NAME } from '@scentiq/shared';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { I18nProvider, useDocumentLocale, useI18n } from '@/i18n/I18nProvider';
import { ButtonLink } from '@/ui/Button';
import { Container } from '@/ui/Container';
import { EmptyState } from '@/ui/EmptyState';

function StudioContent() {
  const { t } = useI18n();
  useDocumentTitle(`${t.studio.title} | ${BRAND_NAME}`);
  return (
    <main id="main" className="min-h-dvh">
      <Container className="py-16">
        <EmptyState
          headingLevel={1}
          title={t.studio.title}
          description={t.studio.body}
          action={<ButtonLink to="/">{t.studio.action}</ButtonLink>}
        />
      </Container>
    </main>
  );
}

export function StudioPage() {
  useDocumentLocale('ar');
  return (
    <I18nProvider locale="ar">
      <StudioContent />
    </I18nProvider>
  );
}
