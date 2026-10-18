import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useI18n } from '@/i18n/I18nProvider';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

/** Storefront frame: skip link, header, the page, footer. Pages never render their own <main>. */
export function SiteLayout() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const lastPath = useRef(pathname);

  // After a client-side navigation, start at the top and move focus into the new page so
  // keyboard and screen-reader users are not left on the link they just activated.
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    window.scrollTo(0, 0);
    mainRef.current?.focus();
  }, [pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="skip-link">
        {t.skipToContent}
      </a>
      <SiteHeader />
      <main id="main" ref={mainRef} tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
