import { BRAND_COPY, BRAND_NAME } from '@scentiq/shared';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useI18n } from '@/i18n/I18nProvider';
import { Container } from '@/ui/Container';
import { EmptyState } from '@/ui/EmptyState';

/**
 * Phase 1 home: the real brand copy plus an honest "being prepared" note. There are no buttons
 * that lead nowhere; the catalog arrives in Phase 3 and the storefront in Phase 4.
 */
export function HomePage() {
  const { locale, t } = useI18n();
  const copy = BRAND_COPY[locale];
  useDocumentTitle(`${BRAND_NAME} | ${copy.tagline}`);

  return (
    <>
      <section className="hero-glow border-b border-line">
        <Container className="flex flex-col items-center gap-5 py-20 text-center sm:py-28">
          <p className="m-0 text-sm font-medium text-accent">{copy.tagline}</p>
          <h1 className="text-4xl font-semibold text-ink sm:text-6xl">{copy.headline}</h1>
          <p className="m-0 max-w-prose text-lg text-muted">{copy.description}</p>
        </Container>
      </section>
      <Container className="py-12">
        <EmptyState title={t.home.statusTitle} description={t.home.statusBody} />
      </Container>
    </>
  );
}
