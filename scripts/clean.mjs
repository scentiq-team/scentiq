// Cross-platform clean: removes build output. No rimraf dependency needed (Node built-ins only).
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const targets = [
  'apps/backend/dist',
  'apps/frontend/dist',
  'packages/shared/dist',
  'apps/frontend/playwright-report',
  'apps/frontend/test-results',
];

for (const target of targets) {
  rmSync(new URL(`../${target}`, import.meta.url), { recursive: true, force: true });
}
console.log(`Cleaned build output under ${root}`);
