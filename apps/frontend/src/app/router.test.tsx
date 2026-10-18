import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '@/test/renderRoute';

describe('storefront routes', () => {
  it('shows the Arabic home page at / with lang=ar and dir=rtl', async () => {
    renderRoute('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'اكتشف عطرك المثالي' }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.title).toBe('ScentIQ | عطور فاخرة');
  });

  it('shows the English home page at /en with lang=en and dir=ltr', async () => {
    renderRoute('/en');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Find your signature scent' }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.title).toBe('ScentIQ | Luxury fragrance');
  });

  it('tells the truth on the home page: the store is being prepared, with no dead buttons', async () => {
    renderRoute('/');
    const main = await screen.findByRole('main');
    expect(
      within(main).getByRole('heading', { level: 2, name: 'المتجر قيد التجهيز' }),
    ).toBeInTheDocument();
    expect(within(main).queryByRole('button')).toBeNull();
    expect(within(main).queryByRole('link')).toBeNull();
  });

  it('links to the other language and keeps the same page', async () => {
    renderRoute('/');
    const toEnglish = await screen.findByRole('link', { name: 'التبديل إلى اللغة الإنجليزية' });
    expect(toEnglish).toHaveAttribute('href', '/en');
    expect(toEnglish).toHaveTextContent('English');
    expect(toEnglish).toHaveAttribute('lang', 'en');
  });

  it('links back to Arabic from the English pages', async () => {
    renderRoute('/en/nope');
    const toArabic = await screen.findByRole('link', { name: 'Switch to Arabic' });
    expect(toArabic).toHaveAttribute('href', '/nope');
    expect(toArabic).toHaveTextContent('العربية');
  });

  it('switching language navigates and flips lang and dir', async () => {
    const user = userEvent.setup();
    renderRoute('/');
    await user.click(await screen.findByRole('link', { name: 'التبديل إلى اللغة الإنجليزية' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Find your signature scent' }),
    ).toBeInTheDocument();
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('has a skip link that targets the main landmark', async () => {
    renderRoute('/');
    const skip = await screen.findByRole('link', { name: 'تخطّي إلى المحتوى' });
    expect(skip).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });

  it('has exactly one main landmark, one banner and one contentinfo', async () => {
    renderRoute('/');
    await screen.findByRole('main');
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
  });
});

describe('not found pages', () => {
  it('shows an Arabic 404 with a way home', async () => {
    renderRoute('/nope');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'الصفحة غير موجودة' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'العودة إلى الرئيسية' })).toHaveAttribute('href', '/');
    expect(document.title).toBe('الصفحة غير موجودة | ScentIQ');
  });

  it('shows an English 404 under /en with a link to the English home', async () => {
    renderRoute('/en/anything/deep');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/en');
  });

  it('has no English Studio: /en/studio is a normal 404', async () => {
    renderRoute('/en/studio');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument();
  });
});

describe('Studio placeholder', () => {
  it('loads lazily, in Arabic, outside the storefront frame', async () => {
    renderRoute('/studio');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Perfume Studio' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('banner')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('also catches deeper Studio paths', async () => {
    renderRoute('/studio/orders/12');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Perfume Studio' }),
    ).toBeInTheDocument();
  });
});

describe('developer pages (present in test builds only)', () => {
  it('serves the sample product route that the SEO shell hands over to', async () => {
    renderRoute('/p/test');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'صفحة منتج تجريبية' }),
    ).toBeInTheDocument();
    expect(screen.getByText('/p/test')).toBeInTheDocument();
    // The production-bundle check looks for this marker, so it must really be on the page.
    expect(document.querySelector('[data-dev-page="product-placeholder"]')).not.toBeNull();
  });

  it('shows the not-found page for any other product path, like the server does', async () => {
    renderRoute('/p/unknown');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'الصفحة غير موجودة' }),
    ).toBeInTheDocument();
  });

  it('serves the English sample product under /en', async () => {
    renderRoute('/en/p/test');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sample product page' }),
    ).toBeInTheDocument();
  });

  it('serves the style guide', async () => {
    renderRoute('/dev/style-guide');
    await waitFor(() =>
      expect(document.querySelector('[data-dev-page="style-guide"]')).not.toBeNull(),
    );
  });
});

describe('navigation behaviour', () => {
  it('moves focus into the page and scrolls to the top after a client-side navigation', async () => {
    const user = userEvent.setup();
    renderRoute('/nope');
    await screen.findByRole('heading', { level: 1, name: 'الصفحة غير موجودة' });
    (window.scrollTo as unknown as { mockClear: () => void }).mockClear();

    await user.click(screen.getByRole('link', { name: 'العودة إلى الرئيسية' }));
    await screen.findByRole('heading', { level: 1, name: 'اكتشف عطرك المثالي' });

    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus());
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });
});

describe('mobile menu', () => {
  it('opens and closes with the button and updates its label', async () => {
    const user = userEvent.setup();
    renderRoute('/');
    const open = await screen.findByRole('button', { name: 'فتح القائمة' });
    expect(open).toHaveAttribute('aria-expanded', 'false');

    await user.click(open);
    const close = screen.getByRole('button', { name: 'إغلاق القائمة' });
    expect(close).toHaveAttribute('aria-expanded', 'true');
    expect(close).toHaveAttribute('aria-controls', screen.getByRole('navigation').id);

    await user.click(close);
    expect(screen.getByRole('button', { name: 'فتح القائمة' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('closes on Escape and returns focus to the button', async () => {
    const user = userEvent.setup();
    renderRoute('/');
    await user.click(await screen.findByRole('button', { name: 'فتح القائمة' }));
    await user.keyboard('{Escape}');
    const button = screen.getByRole('button', { name: 'فتح القائمة' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('closes when the shopper picks a link', async () => {
    const user = userEvent.setup();
    renderRoute('/nope');
    await user.click(await screen.findByRole('button', { name: 'فتح القائمة' }));
    await user.click(
      within(screen.getByRole('navigation')).getByRole('link', { name: 'الرئيسية' }),
    );
    await screen.findByRole('heading', { level: 1, name: 'اكتشف عطرك المثالي' });
    expect(screen.getByRole('button', { name: 'فتح القائمة' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('marks the current page in the menu', async () => {
    renderRoute('/');
    const home = await within(await screen.findByRole('navigation')).findByRole('link', {
      name: 'الرئيسية',
    });
    expect(home).toHaveAttribute('aria-current', 'page');
  });
});
