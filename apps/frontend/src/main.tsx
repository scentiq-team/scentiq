import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppProviders } from './app/providers';
import { createRoutes } from './app/router';
import './styles/fonts.css';
import './styles/index.css';

const router = createBrowserRouter(createRoutes(), {
  basename: import.meta.env.BASE_URL,
});

const container = document.getElementById('root');
if (container === null) throw new Error('The #root element is missing from index.html');

// React replaces the server-written first content (SEO shell) instead of hydrating it:
// the shell is deliberately minimal, so there is nothing to mismatch (ADR-0002).
createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
