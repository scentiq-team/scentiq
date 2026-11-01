// Prepares the private preview build for Cloudflare Pages (docs/preview-cloudflare.md).
// The preview is the "e2e" build (it still contains the developer pages, so the style guide is
// visible) and must never be used as the real production site. It adds two files:
//  - _redirects: every path serves index.html, so deep links such as /p/test work.
//  - _headers: noindex, so search engines ignore the preview even if the link leaks.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'frontend', 'dist-e2e');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, '_redirects'), '/*  /index.html  200\n');
writeFileSync(
  join(out, '_headers'),
  '/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n',
);
console.log(`Preview files written to ${out}`);
