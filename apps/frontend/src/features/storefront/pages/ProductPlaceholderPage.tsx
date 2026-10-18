// Development and e2e builds only (see createRoutes). It exists so the SEO shell spike has a page
// to hand over to; the production build has no /p/... route until Phase 4 builds the real page,
// which keeps the browser and the server (which answers 404 for unknown products) in agreement.
import { BRAND_NAME, type Locale } from '@scentiq/shared';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useI18n } from '@/i18n/I18nProvider';
import { Container } from '@/ui/Container';
import { EmptyState } from '@/ui/EmptyState';

const COPY: Record<Locale, { title: string; body: string }> = {
  ar: {
    title: 'صفحة منتج تجريبية',
    body: 'مسار تجريبي لإثبات عمل الـ SEO. تُبنى صفحة المنتج الحقيقية في المرحلة 4.',
  },
  en: {
    title: 'Sample product page',
    body: 'A sample route that proves the SEO path. The real product page is built in Phase 4.',
  },
};

export function ProductPlaceholderPage() {
  const { locale } = useI18n();
  const copy = COPY[locale];
  useDocumentTitle(`${copy.title} | ${BRAND_NAME}`);

  return (
    <Container data-dev-page="product-placeholder" className="py-16">
      <EmptyState
        headingLevel={1}
        title={copy.title}
        description={copy.body}
        action={<span className="ltr-run text-sm text-muted">/p/test</span>}
      />
    </Container>
  );
}
