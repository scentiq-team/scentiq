import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiTarget = env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3000';

  return {
    base: process.env.GITHUB_PAGES === 'true' ? '/scentiq/' : '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    define: {
      __DEV_PAGES__: JSON.stringify(mode === 'development' || mode === 'e2e'),
    },
    server: {
      port: 5173,
      proxy: {
        '/api': apiTarget,
        '/healthz': apiTarget,
        '/readyz': apiTarget,
      },
    },
    build: {
      target: 'es2022',
      assetsInlineLimit: 0,
    },
  };
});