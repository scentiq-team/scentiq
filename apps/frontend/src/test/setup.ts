import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom does not implement scrolling; the layout scrolls to the top after navigation.
window.scrollTo = vi.fn();

afterEach(() => {
  cleanup();
  document.documentElement.lang = 'ar';
  document.documentElement.dir = 'rtl';
  document.title = '';
});
