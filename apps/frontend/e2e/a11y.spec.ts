import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { PAGES } from './pages';

// Automated checks catch about a third of accessibility problems. They are a floor, not a
// replacement for keyboard and screen-reader checks (see the keyboard tests below).
for (const { url, name } of PAGES) {
  test(`${name} has no WCAG A/AA violations found by axe`, async ({ page }) => {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const summary = results.violations.map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`,
    );
    expect(summary).toEqual([]);
  });
}

test.describe('keyboard', () => {
  test('the first Tab stop is the skip link, and it moves focus to the content', async ({
    page,
  }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'تخطّي إلى المحتوى' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
  });

  test('the focused element always has a visible outline', async ({ page }) => {
    await page.goto('/nope');
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press('Tab');
      const outline = await page.evaluate(() => {
        const style = getComputedStyle(document.activeElement as Element);
        return { width: style.outlineWidth, style: style.outlineStyle };
      });
      expect(outline.style).not.toBe('none');
      expect(Number.parseFloat(outline.width)).toBeGreaterThanOrEqual(2);
    }
  });
});
