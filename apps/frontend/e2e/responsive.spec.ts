import { expect, test } from '@playwright/test';
import { PAGES } from './pages';

const WIDTHS = [320, 360, 390, 768, 1280];

// "No horizontal scroll" is a quality gate for every screen, from a small phone to a desktop.
test.describe('no horizontal scroll', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'the sizes are set by the test, so the desktop project is enough',
  );

  for (const { url, name } of PAGES) {
    for (const width of WIDTHS) {
      test(`${name} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        const overflow = await page.evaluate(() => {
          const root = document.documentElement;
          return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
        });
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
      });
    }
  }
});
