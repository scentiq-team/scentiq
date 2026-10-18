import { useRouteError } from 'react-router';
import { I18nProvider, useDocumentLocale } from '@/i18n/I18nProvider';
import { Container } from '@/ui/Container';
import { ErrorState } from '@/ui/ErrorState';

/**
 * Shown when a route throws while rendering or loading. The most common real cause after a
 * deployment is a lazy chunk that no longer exists, and a reload fixes that, so retry reloads.
 * Must be rendered inside an <I18nProvider>.
 */
export function RouteError() {
  const error = useRouteError();
  return (
    <Container className="py-16">
      <ErrorState error={error} onRetry={() => window.location.reload()} />
    </Container>
  );
}

/** For top-level routes that sit outside the storefront layout (Studio, developer pages). */
export function StandaloneRouteError() {
  useDocumentLocale('ar');
  return (
    <I18nProvider locale="ar">
      <main id="main">
        <RouteError />
      </main>
    </I18nProvider>
  );
}
