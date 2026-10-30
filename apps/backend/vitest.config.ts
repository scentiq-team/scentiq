import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Creates the development database roles once, before the database tests start.
    globalSetup: ['./src/test/global-setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
