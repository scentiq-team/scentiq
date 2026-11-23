import { defineConfig } from 'vitest/config';

// `pnpm --filter @scentiq/shared test:coverage` (ADR-0014: at least 90% on pure domain logic).
// Only the modules that hold logic are measured; brand.ts and health.ts are constants.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: [
        'src/arabic-search.ts',
        'src/catalog-completion.ts',
        'src/catalog-schemas.ts',
        'src/collection-rules.ts',
        'src/locale.ts',
        'src/money.ts',
        'src/problem.ts',
        'src/seo-routes.ts',
        'src/slugify.ts',
      ],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
});
