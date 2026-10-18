import { expect, test } from '@playwright/test';

// With no SITE_ORIGIN set, the server builds absolute URLs from its own port.
const ORIGIN = 'http://localhost:3100';

// What a crawler or a link preview sees: the HTML the server sends, before any JavaScript runs.

test.describe('SEO shell for the sample product (HTML only, no JavaScript)', () => {
  test('Arabic product page carries title, canonical, language alternates and Open Graph', async ({
    request,
  }) => {
    const response = await request.get('/p/test');
    expect(response.status()).toBe(200);
    const html = await response.text();

    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain('<title>عطر تجريبي | علامة تجريبية | ScentIQ</title>');
    expect(html).toContain(`rel="canonical" href="${ORIGIN}/p/test"`);
    expect(html).toContain(`hreflang="ar" href="${ORIGIN}/p/test"`);
    expect(html).toContain(`hreflang="en" href="${ORIGIN}/en/p/test"`);
    expect(html).toContain(`hreflang="x-default" href="${ORIGIN}/p/test"`);
    expect(html).toContain('property="og:type" content="product"');
    expect(html).toContain(`property="og:image" content="${ORIGIN}/og-default.png"`);
    expect(html).toContain('<h1>عطر تجريبي</h1>');
    expect(html).toContain('100,000 د.ع');
  });

  test('JSON-LD describes the product and its price in IQD', async ({ request }) => {
    const html = await (await request.get('/p/test')).text();
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map(
      (match) => JSON.parse(match[1] as string),
    );
    const product = blocks.find((block) => block['@type'] === 'Product');
    expect(product).toMatchObject({
      name: 'عطر تجريبي',
      offers: {
        '@type': 'Offer',
        priceCurrency: 'IQD',
        price: '100000',
        availability: 'https://schema.org/InStock',
      },
    });
    expect(blocks.some((block) => block['@type'] === 'BreadcrumbList')).toBe(true);
  });

  test('English product page is left-to-right and in English', async ({ request }) => {
    const html = await (await request.get('/en/p/test')).text();
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).toContain('<h1>Sample perfume</h1>');
    expect(html).toContain('IQD 100,000');
  });

  test('test environments are never indexable, sample data included', async ({ request }) => {
    const response = await request.get('/p/test');
    expect(await response.text()).toContain('name="robots" content="noindex,nofollow"');
    expect(response.headers()['x-robots-tag']).toContain('noindex');
  });

  test('an unknown product is a real 404 with no product markup', async ({ request }) => {
    const response = await request.get('/p/unknown');
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('"@type":"Product"');
  });

  test('a hostile slug cannot break out of the page', async ({ request }) => {
    const response = await request.get('/p/%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('<script>alert(1)');
  });
});

test.describe('the same page in a browser that cannot run JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the product is readable without JavaScript', async ({ page }) => {
    await page.goto('/p/test');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('عطر تجريبي');
    await expect(page.getByText('100,000 د.ع')).toBeVisible();
  });
});

test.describe('hand-over from the SEO shell to React', () => {
  test('after the app starts, the product page is shown by React with no errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/p/test');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('صفحة منتج تجريبية');
    expect(errors).toEqual([]);
  });
});

test.describe('security headers', () => {
  test('every page carries a strict CSP and the safety headers', async ({ request }) => {
    const headers = (await request.get('/')).headers();
    const csp = headers['content-security-policy'] ?? '';
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("style-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-request-id']).toBeTruthy();
    expect(headers['permissions-policy']).toContain('camera=()');
    expect(headers['strict-transport-security']).toBeUndefined();
  });
});
