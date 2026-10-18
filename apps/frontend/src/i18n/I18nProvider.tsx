import {
  type Direction,
  formatIqd,
  type Locale,
  localeDirection,
  localizePath,
} from '@scentiq/shared';
import { createContext, type ReactNode, use, useEffect, useMemo } from 'react';
import { ar } from './ar';
import { en } from './en';
import type { Messages } from './messages';

const DICTIONARIES: Record<Locale, Messages> = { ar, en };

export interface I18nValue {
  locale: Locale;
  dir: Direction;
  t: Messages;
  /** Public URL path of a locale-free path, e.g. path('/p/x') -> '/en/p/x' in English. */
  path: (path: string) => string;
  /** Whole dinars with Western digits and the right currency label (ADR-0016). */
  price: (amountIqd: number) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18nValue>(
    () => ({
      locale,
      dir: localeDirection(locale),
      t: DICTIONARIES[locale],
      path: (path) => localizePath(locale, path),
      price: (amountIqd) => formatIqd(amountIqd, locale),
    }),
    [locale],
  );
  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18nValue {
  const value = use(I18nContext);
  if (value === null) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}

/** Keeps <html lang dir> correct after client-side language changes (the server sets the first). */
export function useDocumentLocale(locale: Locale): void {
  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dir = localeDirection(locale);
  }, [locale]);
}
