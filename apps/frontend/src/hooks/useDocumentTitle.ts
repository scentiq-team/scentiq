import { useEffect } from 'react';

/**
 * Keeps the browser tab title in step with client-side navigation. The first title of every page
 * comes from the server (SEO shell, ADR-0002); this only updates it afterwards.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
