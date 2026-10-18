import type { Messages } from './messages';

export const en: Messages = {
  skipToContent: 'Skip to content',
  loading: 'Loading',
  nav: {
    label: 'Main navigation',
    home: 'Home',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
  },
  language: {
    switchTo: 'العربية',
    switchLabel: 'Switch to Arabic',
  },
  footer: { rights: 'All rights reserved.' },
  home: {
    statusTitle: 'The store is being prepared',
    statusBody: 'We are preparing the fragrance collection. Please check back soon.',
  },
  notFound: {
    body: 'This link may be old, or the page was removed.',
    action: 'Back to home',
  },
  studio: {
    title: 'Perfume Studio',
    body: 'The admin area is being built. Sign-in, orders and products arrive in later phases.',
    action: 'Back to the store',
  },
  errorState: {
    title: 'Something went wrong',
    retry: 'Try again',
    reference: 'Reference',
  },
  errors: {
    bad_request: 'We could not understand the request. Please try again.',
    validation_error: 'Some details are not valid. Please review them and try again.',
    unauthorized: 'Please sign in to continue.',
    forbidden: 'You do not have permission to do this.',
    not_found: 'We could not find what you are looking for.',
    conflict: 'Things changed in the meantime. Refresh the page and try again.',
    rate_limited: 'Too many attempts in a short time. Please wait a moment and try again.',
    internal_error: 'Something went wrong on our side. Please try again shortly.',
    service_unavailable: 'The service is temporarily unavailable. Please try again shortly.',
    network_error: 'We could not connect. Check your internet connection and try again.',
    invalid_response: 'The server sent an unexpected response. Please try again.',
  },
};
