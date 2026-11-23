// The registered seeders (ADR-0015). Order matters inside a level: later seeders may rely on the rows of
// earlier ones. A dev seeder must register every row it inserts in `sample_data_registry`; the
// tracking helper in `tracking.ts` does that for all tables at once.
import { devCatalog } from './dev-catalog.js';
import { referenceCatalog } from './reference-catalog.js';
import type { Seeder } from './runner.js';

export const seeders: readonly Seeder[] = [referenceCatalog, devCatalog];
