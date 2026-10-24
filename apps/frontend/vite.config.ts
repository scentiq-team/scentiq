import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiTarget = env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3000';
  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    // Developer pages (style guide) and sample routes exist only in development and in the
    // "e2e" build. The normal production build removes them completely (see src/app/router.tsx).
    define: { __DEV_PAGES__: JSON.stringify(mode === 'development' || mode === 'e2e') },
    // Development mimics the single-origin production layout (ADR-0001): the API paths go to
    // the backend, everything else is served by Vite.
    server: {
      port: 5173,
      proxy: { '/api': apiTarget, '/healthz': apiTarget, '/readyz': apiTarget },
    },
    build: {
      target: 'es2022',
      // The backend sends `font-src 'self'`: fonts must stay real files, never data: URIs.
      assetsInlineLimit: 0,
    },
  };
});
