import { BRAND_COPY, BRAND_NAME } from '@scentiq/shared';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useI18n } from '@/i18n/I18nProvider';
import { ButtonLink } from '@/ui/Button';
import { Container } from '@/ui/Container';
import { EmptyState } from '@/ui/EmptyState';

/** The server answers these URLs with a real 404 status; this is what the shopper sees. */
export function NotFoundPage() {
  const { locale, t, path } = useI18n();
  const title = BRAND_COPY[locale].notFoundTitle;
  useDocumentTitle(`${title} | ${BRAND_NAME}`);

  return (
    <Container className="py-16">
      <EmptyState
        headingLevel={1}
        title={title}
        description={t.notFound.body}
        action={<ButtonLink to={path('/')}>{t.notFound.action}</ButtonLink>}
      />
    </Container>
  );
}
