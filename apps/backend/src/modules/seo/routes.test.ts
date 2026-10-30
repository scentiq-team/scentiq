import { mkdtemp, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../config/env.js';
import { makeApp, productionEnv, testConfig } from '../../test/helpers.js';
import { TemplateError } from './shell.js';
import type { ProductSource } from './types.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const get = (url: string, headers: Record<string, string> = {}) =>
  (app as FastifyInstance).inject({ method: 'GET', url, headers });

describe('SEO shell: home page', () => {
  it('serves Arabic RTL HTML with head metadata and visible content, without JavaScript', async () => {
    app = await makeApp();
    const response = await get('/');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['cache-control']).toBe('no-cache');
    const html = response.body;
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain('<title>ScentIQ | عطور فاخرة</title>');
    expect(html).toContain('<h1>اكتشف عطرك المثالي</h1>');
    expect(html).toContain('<link rel="canonical" href="http://localhost:3000/">');
    expect(html).toContain('"@type":"Organization"');
    expect(html).not.toContain('scentiq:head');
    expect(html).not.toContain('scentiq:root');
  });

  it('serves English LTR HTML under /en with hreflang alternates', async () => {
    app = await makeApp();
    const html = (await get('/en')).body;
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain('<h1>Find your signature scent</h1>');
    expect(html).toContain('<link rel="canonical" href="http://localhost:3000/en">');
    expect(html).toContain('hreflang="x-default" href="http://localhost:3000/"');
  });

  it('treats a trailing slash like the clean path', async () => {
    app = await makeApp();
    const html = (await get('/en/')).body;
    expect(html).toContain('<link rel="canonical" href="http://localhost:3000/en">');
  });

  it('answers HEAD like GET but sends no body on the wire', async () => {
    app = await makeApp();
    await app.listen({ host: '127.0.0.1', port: 0 });
    const { port } = app.server.address() as AddressInfo;
    const result = await new Promise<{ status: number; type: string; body: string }>(
      (resolve, reject) => {
        const request = httpRequest(
          { host: '127.0.0.1', port, path: '/', method: 'HEAD' },
          (res) => {
            let body = '';
            res.on('data', (chunk) => {
              body += chunk;
            });
            res.on('end', () =>
              resolve({
                status: res.statusCode ?? 0,
                type: String(res.headers['content-type']),
                body,
              }),
            );
          },
        );
        request.on('error', reject);
        request.end();
      },
    );
    expect(result.status).toBe(200);
    expect(result.type).toContain('text/html');
    expect(result.body).toBe('');
  });
});

describe('SEO shell: sample product (outside production)', () => {
  it('returns title, canonical, Open Graph, JSON-LD and an H1 for /p/test', async () => {
    app = await makeApp();
    const response = await get('/p/test');
    expect(response.statusCode).toBe(200);
    const html = response.body;
    expect(html).toContain('<title>عطر تجريبي | علامة تجريبية | ScentIQ</title>');
    expect(html).toContain('<link rel="canonical" href="http://localhost:3000/p/test">');
    expect(html).toContain('<meta property="og:type" content="product">');
    expect(html).toContain(
      '<meta property="og:title" content="عطر تجريبي | علامة تجريبية | ScentIQ">',
    );
    expect(html).toContain('<h1>عطر تجريبي</h1>');
    expect(html).toContain('100,000 د.ع');
    expect(html).toContain('"@type":"Product"');
    expect(html).toContain('"priceCurrency":"IQD"');
    expect(html).toContain('"price":"100000"');
    expect(html).toContain('https://schema.org/InStock');
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  it('serves the English version under /en/p/test', async () => {
    app = await makeApp();
    const html = (await get('/en/p/test')).body;
    expect(html).toContain('<h1>Sample perfume</h1>');
    expect(html).toContain('IQD 100,000');
    expect(html).toContain('<link rel="canonical" href="http://localhost:3000/en/p/test">');
  });

  it('is never indexable, and unknown slugs are real 404s', async () => {
    app = await makeApp();
    expect((await get('/p/test')).body).toContain('content="noindex,nofollow"');
    const missing = await get('/p/does-not-exist');
    expect(missing.statusCode).toBe(404);
    expect(missing.body).toContain('<h1>الصفحة غير موجودة</h1>');
    expect(missing.body).not.toContain('rel="canonical"');
  });
});

describe('production rules', () => {
  it('does not expose the sample product or developer pages', async () => {
    app = await makeApp(productionEnv);
    expect((await get('/p/test')).statusCode).toBe(404);
    expect((await get('/dev/style-guide')).statusCode).toBe(404);
  });

  it('allows indexing of real pages and sends no X-Robots-Tag', async () => {
    app = await makeApp(productionEnv);
    const response = await get('/');
    expect(response.body).toContain('<meta name="robots" content="index,follow">');
    expect(response.body).toContain('<link rel="canonical" href="https://scentiq.example/">');
    expect(response.headers['x-robots-tag']).toBeUndefined();
    expect(response.headers['strict-transport-security']).toContain('max-age=15552000');
  });

  it('serves a product from an injected source with indexing on', async () => {
    const products: ProductSource = {
      async find(slug) {
        return slug === 'real-one'
          ? {
              slug,
              nameAr: 'اسم',
              nameEn: 'Name',
              brandAr: 'ماركة',
              brandEn: 'Brand',
              descriptionAr: 'وصف',
              descriptionEn: 'Description',
              priceIqd: 250000,
              inStock: false,
              indexable: true,
            }
          : undefined;
      },
    };
    app = await makeApp(productionEnv, products);
    const html = (await get('/p/real-one')).body;
    expect(html).toContain('content="index,follow"');
    expect(html).toContain('https://schema.org/OutOfStock');
    expect(html).toContain('250,000 د.ع');
  });

  it('escapes hostile product text in every part of the page', async () => {
    const products: ProductSource = {
      async find() {
        return {
          slug: 'x',
          nameAr: '<img src=x onerror=alert(1)>',
          nameEn: '</script><script>alert(2)</script>',
          brandAr: 'b',
          brandEn: 'b',
          descriptionAr: '"><svg onload=alert(3)>',
          descriptionEn: 'd',
          priceIqd: 1000,
          inStock: true,
          indexable: true,
        };
      },
    };
    app = await makeApp(productionEnv, products);
    const html = (await get('/p/x')).body;
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<svg onload');
    expect(html).not.toContain('<script>alert');
    const en = (await get('/en/p/x')).body;
    expect(en).not.toContain('<script>alert(2)');
  });
});

describe('non-production environments are never indexable', () => {
  it('sends X-Robots-Tag and noindex in staging', async () => {
    app = await makeApp({
      ...productionEnv,
      APP_ENV: 'staging',
      SITE_ORIGIN: 'https://staging.scentiq.example',
    });
    const response = await get('/');
    expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(response.body).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('sends X-Robots-Tag on API responses too', async () => {
    app = await makeApp();
    expect((await get('/healthz')).headers['x-robots-tag']).toBe('noindex, nofollow');
  });
});

describe('other routes', () => {
  it('serves Studio with a noindex shell', async () => {
    app = await makeApp(productionEnv);
    const response = await get('/studio/orders');
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<title>Perfume Studio | ScentIQ</title>');
    expect(response.body).toContain('content="noindex,nofollow"');
  });

  it('answers unknown pages with a real 404 and the app shell', async () => {
    app = await makeApp();
    const response = await get('/no-such-page');
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('<title>الصفحة غير موجودة | ScentIQ</title>');
    const english = await get('/en/no-such-page');
    expect(english.statusCode).toBe(404);
    expect(english.body).toContain('<h1>Page not found</h1>');
  });

  it('rejects slugs with uppercase letters or non-Latin characters', async () => {
    app = await makeApp();
    expect((await get('/p/Test')).statusCode).toBe(404);
    expect((await get(`/p/${encodeURIComponent('عطر')}`)).statusCode).toBe(404);
  });

  it('keeps /api paths out of the HTML shell', async () => {
    app = await makeApp();
    const response = await get('/api/v1/unknown');
    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });
});

describe('static files', () => {
  it('serves fingerprinted assets with a one-year immutable cache', async () => {
    app = await makeApp();
    const response = await get('/assets/app-test.css');
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('serves other public files with a one-day cache', async () => {
    app = await makeApp();
    const response = await get('/favicon.svg');
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=86400');
  });

  it('never serves the raw template', async () => {
    app = await makeApp();
    const response = await get('/index.html');
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('scentiq:head');
  });

  it('does not allow path traversal out of the dist folder', async () => {
    app = await makeApp();
    const response = await get('/assets/..%2f..%2fapp.ts');
    expect(response.statusCode).toBe(404);
  });
});

describe('startup rules', () => {
  it('refuses to start in production without a frontend build', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'scentiq-empty-'));
    const config = loadEnv({ ...productionEnv, FRONTEND_DIST_DIR: empty });
    await expect(buildApp({ config, logger: false })).rejects.toThrow(/No frontend build/);
  });

  it('runs API-only in development when there is no frontend build', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'scentiq-empty-'));
    app = await buildApp({
      config: testConfig({ FRONTEND_DIST_DIR: empty }),
      logger: false,
    });
    expect((await get('/healthz')).statusCode).toBe(200);
    const page = await get('/');
    expect(page.statusCode).toBe(404);
    expect(page.headers['content-type']).toContain('application/problem+json');
  });

  it('refuses a build whose index.html lacks the SEO markers', async () => {
    const broken = await mkdtemp(join(tmpdir(), 'scentiq-broken-'));
    await writeFile(join(broken, 'index.html'), '<html><head></head><body></body></html>');
    await expect(
      buildApp({ config: testConfig({ FRONTEND_DIST_DIR: broken }), logger: false }),
    ).rejects.toThrow(TemplateError);
  });
});
