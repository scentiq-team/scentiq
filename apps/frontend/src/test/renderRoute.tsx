import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from '@/app/providers';
import { createRoutes } from '@/app/router';

/** Renders the real route table at a URL, the way the browser would, without a server. */
export function renderRoute(url: string) {
  const router = createMemoryRouter(createRoutes(), { initialEntries: [url] });
  const view = render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { router, ...view };
}
