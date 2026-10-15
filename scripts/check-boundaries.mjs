// Enforces the import boundaries from ADR-0013 (cross-platform, no dependencies):
//  1. features/storefront and features/studio never import each other.
//  2. Static imports of features/studio are only allowed inside features/studio itself
//     (the router loads Studio with a dynamic import() so it stays a separate chunk).
//  3. packages/shared never imports from apps/*.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const frontendSrc = join(repoRoot, 'apps', 'frontend', 'src');
const sharedSrc = join(repoRoot, 'packages', 'shared', 'src');

const STATIC_IMPORT = /^\s*(?:import|export)\s[^;'"]*?from\s+['"]([^'"]+)['"]/gm;
const SIDE_EFFECT_IMPORT = /^\s*import\s+['"]([^'"]+)['"]/gm;

function* walk(dir) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(name)) yield full;
  }
}

function resolveSpecifier(fromFile, spec) {
  if (spec.startsWith('@/')) return join(frontendSrc, spec.slice(2));
  if (spec.startsWith('.')) return resolve(dirname(fromFile), spec);
  return null;
}

const inside = (file, dir) => file === dir || file.startsWith(dir + sep);
const studioDir = join(frontendSrc, 'features', 'studio');
const storefrontDir = join(frontendSrc, 'features', 'storefront');
const problems = [];

for (const file of walk(frontendSrc)) {
  const text = readFileSync(file, 'utf8');
  const specs = [...text.matchAll(STATIC_IMPORT), ...text.matchAll(SIDE_EFFECT_IMPORT)].map(
    (m) => m[1],
  );
  for (const spec of specs) {
    const target = resolveSpecifier(file, spec);
    if (!target) continue;
    if (inside(target, studioDir) && !inside(file, studioDir)) {
      problems.push(
        `${relative(repoRoot, file)} statically imports Studio ("${spec}"). Use import().`,
      );
    }
    if (inside(file, studioDir) && inside(target, storefrontDir)) {
      problems.push(`${relative(repoRoot, file)} (Studio) imports the storefront ("${spec}").`);
    }
    if (inside(file, storefrontDir) && inside(target, studioDir)) {
      problems.push(`${relative(repoRoot, file)} (storefront) imports Studio ("${spec}").`);
    }
  }
}

for (const file of walk(sharedSrc)) {
  const text = readFileSync(file, 'utf8');
  const specs = [...text.matchAll(STATIC_IMPORT)].map((m) => m[1]);
  for (const spec of specs) {
    if (
      spec.includes('/apps/') ||
      spec.includes('@scentiq/frontend') ||
      spec.includes('@scentiq/backend')
    ) {
      problems.push(`${relative(repoRoot, file)} (shared) imports an app ("${spec}").`);
    }
  }
}

if (problems.length > 0) {
  console.error(`Import boundary violations:\n - ${problems.join('\n - ')}`);
  process.exit(1);
}
console.log('Import boundaries OK');
