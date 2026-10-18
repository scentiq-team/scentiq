import { expect, test } from '@playwright/test';

test.describe('pages open and tell the browser their language and direction', () => {
  test('Arabic home: lang=ar, dir=rtl, title and heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('اكتشف عطرك المثالي');
    await expect(page).toHaveTitle('ScentIQ | عطور فاخرة');
  });

  test('English home: lang=en, dir=ltr', async ({ page }) => {
    await page.goto('/en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Find your signature scent');
  });

  test('switching language keeps working after React has started', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'التبديل إلى اللغة الإنجليزية' }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Find your signature scent');
  });
});

test.describe('unknown pages are real 404s, never soft 404s', () => {
  for (const url of ['/nope', '/en/nope', '/p/Not_A_Slug', '/studio-x']) {
    test(`${url} answers 404 and still shows a useful page`, async ({ page }) => {
      const response = await page.goto(url);
      expect(response?.status()).toBe(404);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(
        page.getByRole('main').getByRole('link', { name: /العودة إلى الرئيسية|Back to home/ }),
      ).toBeVisible();
    });
  }
});

test.describe('health and API errors', () => {
  test('/healthz answers ok as JSON', async ({ request }) => {
    const response = await request.get('/healthz');
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });

  test('an unknown API path answers problem+json with a stable code', async ({ request }) => {
    const response = await request.get('/api/v1/nothing');
    expect(response.status()).toBe(404);
    expect(response.headers()['content-type']).toContain('application/problem+json');
    expect(await response.json()).toMatchObject({ status: 404, code: 'not_found' });
  });
});

test.describe('the page is clean', () => {
  for (const url of ['/', '/en', '/studio', '/dev/style-guide', '/nope']) {
    test(`${url} has no console errors, failed requests or CSP violations`, async ({ page }) => {
      const problems: string[] = [];
      page.on('console', (message) => {
        // The 404 pages are meant to answer 404; the browser reports that status for the document.
        if (message.type() === 'error' && !message.text().includes('status of 404')) {
          problems.push(`console: ${message.text()}`);
        }
      });
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
      page.on('requestfailed', (request) => {
        problems.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`);
      });
      page.on('response', (response) => {
        if (response.status() >= 400 && response.request().resourceType() !== 'document') {
          problems.push(`http ${response.status()}: ${response.url()}`);
        }
      });
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      expect(problems).toEqual([]);
    });
  }
});

test.describe('assets', () => {
  test('icons and the share image exist with the right types', async ({ request }) => {
    for (const [path, type] of [
      ['/favicon.svg', 'image/svg+xml'],
      ['/favicon.ico', 'image/'],
      ['/apple-touch-icon.png', 'image/png'],
      ['/og-default.png', 'image/png'],
    ] as const) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      expect(response.headers()['content-type'], path).toContain(type);
    }
  });

  test('the Arabic page loads its self-hosted fonts', async ({ page }) => {
    const fonts: string[] = [];
    page.on('response', (response) => {
      if (response.url().endsWith('.woff2') && response.status() === 200)
        fonts.push(response.url());
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(fonts.some((url) => url.includes('ibm-plex-sans-arabic-arabic'))).toBe(true);
    expect(fonts.some((url) => url.includes('el-messiri-arabic'))).toBe(true);
  });

  test('fingerprinted assets are cacheable forever and index.html is never served raw', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    const script = await page.locator('script[type="module"]').getAttribute('src');
    expect(script).toMatch(/^\/assets\/.+\.js$/);
    const asset = await request.get(script as string);
    expect(asset.headers()['cache-control']).toContain('immutable');
    expect((await request.get('/index.html')).status()).toBe(404);
  });
});
