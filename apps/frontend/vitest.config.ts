import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: { __DEV_PAGES__: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // CSS is not processed in tests, except tokens.css and index.css, which tokens.test.ts reads as text
    // to verify the contrast of every colour pair.
    css: { include: [/(tokens|index)\.css/] },
  },
});
