import { BRAND_NAME } from '@scentiq/shared';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { useI18n } from '@/i18n/I18nProvider';
import { Container } from '@/ui/Container';
import { CloseIcon, MenuIcon } from '@/ui/icons';
import { Logo } from '@/ui/Logo';
import { cx } from '@/utils/cx';
import { LanguageSwitch } from './LanguageSwitch';

/**
 * Header with a disclosure menu on phones (a button that shows or hides the links; not a modal,
 * so no focus trap is needed) and an inline menu from the md breakpoint up.
 */
export function SiteHeader() {
  const { t, path } = useI18n();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Later phases add brands, collections and search here.
  const items = [{ to: path('/'), label: t.nav.home }];

  // biome-ignore lint/correctness/useExhaustiveDependencies: close the menu whenever the page changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <Container className="relative flex min-h-16 items-center gap-2">
        <Link
          to={path('/')}
          aria-label={`${BRAND_NAME}, ${t.nav.home}`}
          className="inline-flex min-h-11 items-center no-underline"
        >
          <Logo />
        </Link>

        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? t.nav.closeMenu : t.nav.openMenu}
          onClick={() => setOpen((value) => !value)}
          className="order-2 grid size-11 place-items-center rounded-control text-ink hover:bg-surface-2 md:hidden"
        >
          {open ? <CloseIcon /> : <MenuIcon />}
        </button>

        <nav
          id={panelId}
          aria-label={t.nav.label}
          className={cx(
            open
              ? 'absolute inset-x-0 top-full border-b border-line bg-bg px-4 py-3 sm:px-6'
              : 'hidden',
            'md:static md:block md:flex-1 md:border-0 md:bg-transparent md:p-0 md:ps-8',
          )}
        >
          <ul className="m-0 flex list-none flex-col gap-1 p-0 md:flex-row md:gap-2">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    cx(
                      'inline-flex min-h-11 items-center rounded-control px-3 text-sm no-underline',
                      isActive ? 'text-accent' : 'text-ink hover:text-accent',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <LanguageSwitch className="order-1 ms-auto inline-flex min-h-11 items-center rounded-control px-3 text-sm text-ink no-underline hover:text-accent md:order-2 md:ms-0" />
      </Container>
    </header>
  );
}
