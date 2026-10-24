import type { ClientErrorCode } from '@/services/api/errors';

/**
 * The shape both dictionaries must have. Because `errors` is keyed by ClientErrorCode, adding an
 * error code to @scentiq/shared fails the type check until both languages have a message for it.
 * Brand copy that the SEO shell also prints (headline, description, 404 title) is NOT here: it
 * lives in @scentiq/shared (BRAND_COPY) so a crawler and a shopper always read the same words.
 */
export interface Messages {
  skipToContent: string;
  loading: string;
  nav: {
    label: string;
    home: string;
    openMenu: string;
    closeMenu: string;
  };
  language: {
    /** Visible text of the link to the other language, written in that language. */
    switchTo: string;
    switchLabel: string;
  };
  footer: { rights: string };
  home: { statusTitle: string; statusBody: string };
  notFound: { body: string; action: string };
  studio: { title: string; body: string; action: string };
  errorState: { title: string; retry: string; reference: string };
  errors: Record<ClientErrorCode, string>;
}
