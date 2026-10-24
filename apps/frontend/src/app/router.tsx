import type { Locale } from '@scentiq/shared';
import type { RouteObject } from 'react-router';
import { HomePage } from '@/features/storefront/pages/HomePage';
import { NotFoundPage } from '@/features/storefront/pages/NotFoundPage';
import { LocaleLayout } from './layout/LocaleLayout';
import { RouteError, StandaloneRouteError } from './RouteError';

/**
 * Developer pages (the style guide) exist only when `__DEV_PAGES__` is true: in development and
 * in the "e2e" build. The check reads the build-time constant directly so the bundler deletes
 * the whole branch, and the page chunks with it, from the production build (ADR-0015).
 * scripts/check-production-bundle.mjs fails the build if anything leaks.
 */
function devStandaloneRoutes(): RouteObject[] {
  if (!__DEV_PAGES__) return [];
  return [
    {
      path: '/dev/style-guide',
      errorElement: <StandaloneRouteError />,
      lazy: async () => ({
        Component: (await import('@/features/dev/StyleGuidePage')).StyleGuidePage,
      }),
    },
  ];
}

/**
 * The sample product route that lets the SEO shell spike hand over to React (same rule as above).
 * It matches only the one slug the server knows ("test"); any other /p/... answers 404 on the
 * server, so the browser must show the not-found page for it too.
 */
function devStorefrontRoutes(): RouteObject[] {
  if (!__DEV_PAGES__) return [];
  return [
    {
      path: 'p/test',
      lazy: async () => ({
        Component: (await import('@/features/storefront/pages/ProductPlaceholderPage'))
          .ProductPlaceholderPage,
      }),
    },
  ];
}

function storefront(locale: Locale): RouteObject {
  return {
    path: locale === 'ar' ? '/' : '/en',
    element: <LocaleLayout locale={locale} />,
    children: [
      {
        // Errors render inside the layout, so the header and footer stay available.
        errorElement: <RouteError />,
        children: [
          { index: true, element: <HomePage /> },
          ...devStorefrontRoutes(),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  };
}

/**
 * The route table. Paths mirror `matchRoute` in @scentiq/shared, which the backend uses to pick
 * the status code and the SEO shell for the same URL: if you add a page here, add it there.
 */
export function createRoutes(): RouteObject[] {
  return [
    ...devStandaloneRoutes(),
    {
      // Arabic only (no /en/studio), matching the server's route table.
      path: '/studio/*',
      errorElement: <StandaloneRouteError />,
      lazy: async () => ({
        Component: (await import('@/features/studio/StudioPage')).StudioPage,
      }),
    },
    storefront('ar'),
    storefront('en'),
  ];
}
