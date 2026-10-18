// Fails when anything meant for developers ends up in the production frontend build (ADR-0015):
// the style guide and the sample product page exist only in development and e2e builds.
//
//   node scripts/check-production-bundle.mjs
//
// It scans apps/frontend/dist. If apps/frontend/dist-e2e exists it also confirms that build DOES
// contain the markers, so a renamed marker can never make this check pass by accident.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const productionDir = join(repoRoot, 'apps', 'frontend', 'dist');
const e2eDir = join(repoRoot, 'apps', 'frontend', 'dist-e2e');

// data-dev-page is set on the root element of every developer page (see StyleGuidePage and
// ProductPlaceholderPage). The other strings are visible text and route names of those pages.
const CONTENT_MARKERS = [
  'data-dev-page',
  'dev/style-guide',
  'صفحة منتج تجريبية',
  'Sample product page',
];
const FILE_NAME_MARKERS = ['StyleGuide', 'ProductPlaceholder'];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

function findLeaks(dir) {
  const leaks = [];
  for (const file of walk(dir)) {
    const shown = relative(repoRoot, file);
    for (const marker of FILE_NAME_MARKERS) {
      if (file.includes(marker)) leaks.push(`${shown} (file name contains "${marker}")`);
    }
    if (!/\.(js|css|html|json|map|txt|svg)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const marker of CONTENT_MARKERS) {
      if (text.includes(marker)) leaks.push(`${shown} (contains "${marker}")`);
    }
  }
  return leaks;
}

if (!existsSync(productionDir)) {
  console.error('apps/frontend/dist does not exist. Run "pnpm build" first.');
  process.exit(1);
}

const problems = findLeaks(productionDir).map((leak) => `LEAK in production build: ${leak}`);

if (existsSync(e2eDir)) {
  const e2eLeaks = findLeaks(e2eDir);
  const sawContent = CONTENT_MARKERS.some((marker) =>
    e2eLeaks.some((leak) => leak.includes(`"${marker}"`)),
  );
  if (!sawContent) {
    problems.push(
      'The e2e build contains none of the developer markers, so this check can no longer tell a leak from a clean build. Update CONTENT_MARKERS.',
    );
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(
  existsSync(e2eDir)
    ? 'Production bundle is clean (and the e2e build still carries the dev pages, as expected).'
    : 'Production bundle is clean.',
);
