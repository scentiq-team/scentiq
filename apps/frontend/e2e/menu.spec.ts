import { expect, test } from '@playwright/test';

test.describe('header menu', () => {
  test('phones get a menu button and desktops show the links inline', async ({
    page,
  }, testInfo) => {
    await page.goto('/');
    const button = page.getByRole('button', { name: /فتح القائمة|إغلاق القائمة/ });
    const homeLink = page.getByRole('navigation').getByRole('link', { name: 'الرئيسية' });
    if (testInfo.project.name === 'desktop') {
      await expect(button).toBeHidden();
      await expect(homeLink).toBeVisible();
    } else {
      await expect(button).toBeVisible();
      await expect(homeLink).toBeHidden();
    }
  });

  test('on a phone the menu opens, closes with Escape and returns focus', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', 'the menu button only exists on phones');
    await page.goto('/nope');
    const open = page.getByRole('button', { name: 'فتح القائمة' });
    await expect(open).toHaveAttribute('aria-expanded', 'false');
    await open.click();
    const homeLink = page.getByRole('navigation').getByRole('link', { name: 'الرئيسية' });
    await expect(homeLink).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(homeLink).toBeHidden();
    await expect(page.getByRole('button', { name: 'فتح القائمة' })).toBeFocused();
  });

  test('on a phone, choosing a link navigates and closes the menu', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'desktop', 'the menu button only exists on phones');
    await page.goto('/nope');
    await page.getByRole('button', { name: 'فتح القائمة' }).click();
    await page.getByRole('navigation').getByRole('link', { name: 'الرئيسية' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('اكتشف عطرك المثالي');
    await expect(page.getByRole('button', { name: 'فتح القائمة' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  test('touch targets in the header are at least 44px', async ({ page }) => {
    await page.goto('/');
    for (const locator of [
      page.getByRole('link', { name: /ScentIQ/ }),
      page.getByRole('link', { name: 'التبديل إلى اللغة الإنجليزية' }),
    ]) {
      const box = await locator.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  });
});
