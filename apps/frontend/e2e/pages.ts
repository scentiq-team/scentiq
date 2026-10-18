/** The URLs that exist in an e2e build, with the language each one is written in. */
export const PAGES = [
  { url: '/', lang: 'ar', name: 'home (ar)' },
  { url: '/en', lang: 'en', name: 'home (en)' },
  { url: '/nope', lang: 'ar', name: '404 (ar)' },
  { url: '/en/nope', lang: 'en', name: '404 (en)' },
  { url: '/studio', lang: 'ar', name: 'studio' },
  { url: '/dev/style-guide', lang: 'ar', name: 'style guide' },
] as const;
