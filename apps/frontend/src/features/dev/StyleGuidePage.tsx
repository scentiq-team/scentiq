// Developer-only style guide: the review surface for the design tokens and base components.
// It is lazy-loaded and exists only in development and in the e2e build (see app/router.tsx),
// so shoppers never receive it. It renders in Arabic (RTL) or English (LTR) with ?lang=en.
import {
  BRAND_COPY,
  BRAND_NAME,
  DEFAULT_LOCALE,
  formatIqd,
  isLocale,
  type Locale,
} from '@scentiq/shared';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { I18nProvider, useDocumentLocale, useI18n } from '@/i18n/I18nProvider';
import { ApiError } from '@/services/api/errors';
import { healthQuery } from '@/services/api/health';
import { Button, ButtonLink } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Container } from '@/ui/Container';
import { EmptyState } from '@/ui/EmptyState';
import { ErrorState } from '@/ui/ErrorState';
import { Input } from '@/ui/Input';
import { Logo } from '@/ui/Logo';
import { LogoMark } from '@/ui/LogoMark';
import { Skeleton } from '@/ui/Skeleton';

interface Copy {
  title: string;
  note: string;
  language: string;
  colors: string;
  typography: string;
  buttons: string;
  fields: string;
  states: string;
  api: string;
  identity: string;
  primary: string;
  secondary: string;
  ghost: string;
  disabled: string;
  loadingLabel: string;
  large: string;
  nameLabel: string;
  nameHint: string;
  phoneLabel: string;
  phoneHint: string;
  phoneError: string;
  emptyTitle: string;
  emptyBody: string;
  emptyAction: string;
  displayAr: string;
  displayLatin: string;
  body: string;
  bodySample: string;
  mixedSample: ReactNode;
  priceLabel: string;
  decorative: string;
  decorativeNote: string;
  apiVersion: string;
  apiTime: string;
  apiEnv: string;
  ctaShop: string;
  ctaMore: string;
}

const COPY: Record<Locale, Copy> = {
  ar: {
    title: 'دليل الأسلوب',
    note: 'للتطوير فقط. لا يظهر في الإنتاج.',
    language: 'اللغة',
    colors: 'الألوان',
    typography: 'الخطوط',
    buttons: 'الأزرار',
    fields: 'الحقول',
    states: 'الحالات',
    api: 'حالة الـ API',
    identity: 'الهوية',
    primary: 'أساسي',
    secondary: 'ثانوي',
    ghost: 'شفاف',
    disabled: 'معطّل',
    loadingLabel: 'جارٍ الإرسال',
    large: 'كبير',
    nameLabel: 'الاسم الكامل',
    nameHint: 'كما تريد أن يظهر على الطلب.',
    phoneLabel: 'رقم الهاتف',
    phoneHint: 'سنتصل بك لتأكيد الطلب.',
    phoneError: 'أدخل رقم هاتف عراقي صحيحاً.',
    emptyTitle: 'لا توجد عطور في قائمتك بعد',
    emptyBody: 'احفظ العطور التي تعجبك لتجدها هنا لاحقاً.',
    emptyAction: 'تصفّح العطور',
    displayAr: 'خط العناوين العربي',
    displayLatin: 'خط العناوين اللاتيني',
    body: 'خط النص',
    bodySample: 'تشكيلة مختارة بعناية من العطور الفاخرة، وتوصية تفهم ذوقك.',
    mixedSample: (
      <>
        عطر <bdi>Dior Sauvage</bdi> بحجم <bdi>100 ml</bdi>
      </>
    ),
    priceLabel: 'السعر',
    decorative: 'الحدود الزخرفية',
    decorativeNote: 'للفواصل فقط. حدود الحقول والأزرار تستعمل لون الحد الوظيفي.',
    apiVersion: 'الإصدار',
    apiTime: 'وقت الخادم',
    apiEnv: 'البيئة',
    ctaShop: 'تسوّق الآن',
    ctaMore: 'اعرف المزيد',
  },
  en: {
    title: 'Style guide',
    note: 'Development only. Never shown in production.',
    language: 'Language',
    colors: 'Colors',
    typography: 'Typography',
    buttons: 'Buttons',
    fields: 'Fields',
    states: 'States',
    api: 'API status',
    identity: 'Identity',
    primary: 'Primary',
    secondary: 'Secondary',
    ghost: 'Ghost',
    disabled: 'Disabled',
    loadingLabel: 'Sending',
    large: 'Large',
    nameLabel: 'Full name',
    nameHint: 'As you want it to appear on the order.',
    phoneLabel: 'Phone number',
    phoneHint: 'We will call to confirm the order.',
    phoneError: 'Enter a valid Iraqi phone number.',
    emptyTitle: 'No fragrances in your list yet',
    emptyBody: 'Save the fragrances you like and find them here later.',
    emptyAction: 'Browse fragrances',
    displayAr: 'Arabic display face',
    displayLatin: 'Latin display face',
    body: 'Body face',
    bodySample:
      'A carefully chosen collection of luxury fragrances, and a recommendation that understands your taste.',
    mixedSample: (
      <>
        <bdi>Dior Sauvage</bdi> in <bdi>100 ml</bdi>
      </>
    ),
    priceLabel: 'Price',
    decorative: 'Decorative border',
    decorativeNote: 'Dividers only. Field and button outlines use the functional control border.',
    apiVersion: 'Version',
    apiTime: 'Server time',
    apiEnv: 'Environment',
    ctaShop: 'Shop now',
    ctaMore: 'Learn more',
  },
};

/** Static class names so Tailwind can see them (no dynamic class building). */
const SWATCHES = [
  { name: 'bg', variable: '--c-bg', swatch: 'bg-bg' },
  { name: 'surface', variable: '--c-surface', swatch: 'bg-surface' },
  { name: 'surface-2', variable: '--c-surface-2', swatch: 'bg-surface-2' },
  { name: 'border', variable: '--c-border', swatch: 'bg-line' },
  { name: 'control-border', variable: '--c-control-border', swatch: 'bg-control' },
  { name: 'text', variable: '--c-text', swatch: 'bg-ink' },
  { name: 'muted', variable: '--c-muted', swatch: 'bg-muted' },
  { name: 'accent', variable: '--c-accent', swatch: 'bg-accent' },
  { name: 'on-accent', variable: '--c-on-accent', swatch: 'bg-on-accent' },
  { name: 'signal', variable: '--c-signal', swatch: 'bg-signal' },
  { name: 'focus', variable: '--c-focus', swatch: 'bg-focus' },
  { name: 'danger', variable: '--c-danger', swatch: 'bg-danger' },
  { name: 'success', variable: '--c-success', swatch: 'bg-success' },
] as const;

/** Reads the live CSS variables so the swatches always show what the page really uses. */
function useTokenValues(): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    setValues(
      Object.fromEntries(
        SWATCHES.map(({ variable }) => [
          variable,
          style.getPropertyValue(variable).trim().toUpperCase(),
        ]),
      ),
    );
  }, []);
  return values;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <h2 className="border-b border-line pb-2 text-3xl font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function ApiStatus({ copy }: { copy: Copy }) {
  const { t } = useI18n();
  const query = useQuery(healthQuery);

  if (query.isPending) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">{t.loading}</span>
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-6 w-1/2" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  }
  const { version, time, env } = query.data;
  return (
    <Card as="section">
      <dl className="m-0 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted">{copy.apiVersion}</dt>
          <dd className="ltr-run m-0 text-lg">{version}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">{copy.apiTime}</dt>
          <dd className="ltr-run m-0 text-lg">{time}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">{copy.apiEnv}</dt>
          <dd className="ltr-run m-0 text-lg">{env ?? '-'}</dd>
        </div>
      </dl>
    </Card>
  );
}

function StyleGuideContent({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const brand = BRAND_COPY[locale];
  const [params, setParams] = useSearchParams();
  const tokens = useTokenValues();
  useDocumentTitle(`${copy.title} | ${BRAND_NAME}`);

  const setLanguage = (next: Locale) => {
    const merged = new URLSearchParams(params);
    merged.set('lang', next);
    setParams(merged, { replace: true });
  };

  return (
    <main id="main" data-dev-page="style-guide" className="min-h-dvh pb-20">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <Container className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col">
            <h1 className="text-2xl font-semibold text-ink">{copy.title}</h1>
            <p className="m-0 text-sm text-muted">{copy.note}</p>
          </div>
          <fieldset className="m-0 flex min-w-0 items-center gap-2 border-0 p-0">
            <legend className="sr-only">{copy.language}</legend>
            <span aria-hidden="true" className="text-sm text-muted">
              {copy.language}
            </span>
            <Button
              variant={locale === 'ar' ? 'primary' : 'secondary'}
              aria-pressed={locale === 'ar'}
              lang="ar"
              onClick={() => setLanguage('ar')}
            >
              العربية
            </Button>
            <Button
              variant={locale === 'en' ? 'primary' : 'secondary'}
              aria-pressed={locale === 'en'}
              lang="en"
              onClick={() => setLanguage('en')}
            >
              English
            </Button>
          </fieldset>
        </Container>
      </header>

      <Container className="flex flex-col gap-14 pt-10">
        <section className="hero-glow flex flex-col items-center gap-5 rounded-card border border-line px-4 py-14 text-center">
          <p className="m-0 text-sm font-medium text-accent">{brand.tagline}</p>
          <LogoMark title={BRAND_NAME} className="size-24" />
          <Logo className="text-5xl sm:text-7xl" />
          <p className="m-0 font-display text-3xl font-semibold text-ink">{brand.headline}</p>
          <p className="m-0 max-w-prose text-muted">{brand.description}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Button size="lg">{copy.ctaShop}</Button>
            <Button size="lg" variant="secondary">
              {copy.ctaMore}
            </Button>
          </div>
        </section>

        <Section title={copy.colors}>
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {SWATCHES.map(({ name, variable, swatch }) => (
              <li
                key={name}
                className="flex items-center gap-3 rounded-card border border-line bg-surface p-3"
              >
                <span
                  aria-hidden="true"
                  className={`size-10 shrink-0 rounded-control border border-control ${swatch}`}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium text-ink">{name}</span>
                  <span className="ltr-run text-xs text-muted">{tokens[variable] ?? ''}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="m-0 text-sm text-muted">
            <strong className="font-medium text-ink">{copy.decorative}:</strong>{' '}
            {copy.decorativeNote}
          </p>
        </Section>

        <Section title={copy.typography}>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <p className="m-0 text-sm text-muted">El Messiri 700 · {copy.displayAr}</p>
              <p
                className="m-0 mt-2 font-display text-5xl font-bold leading-tight text-ink"
                lang="ar"
                dir="rtl"
              >
                عطور فاخرة
              </p>
              <p className="m-0 mt-2 font-display text-2xl text-ink" lang="ar" dir="rtl">
                عود وعنبر وورد
              </p>
            </Card>
            <Card>
              <p className="m-0 text-sm text-muted">Cormorant Garamond 600 · {copy.displayLatin}</p>
              <p
                className="m-0 mt-2 font-display text-5xl font-semibold leading-tight text-ink"
                lang="en"
                dir="ltr"
              >
                ScentIQ
              </p>
              <p className="m-0 mt-2 font-display text-2xl text-ink" lang="en" dir="ltr">
                Oud, amber and rose
              </p>
            </Card>
          </div>
          <Card className="flex flex-col gap-3">
            <p className="m-0 text-sm text-muted">
              IBM Plex Sans Arabic 400 / 500 / 600 · {copy.body}
            </p>
            <p className="m-0 text-lg">{copy.bodySample}</p>
            <p className="m-0 text-lg font-medium">{copy.mixedSample}</p>
            <p className="m-0 text-lg font-semibold">
              {copy.priceLabel}: <span className="ltr-run">{formatIqd(250000, locale)}</span>
            </p>
          </Card>
        </Section>

        <Section title={copy.buttons}>
          <div className="flex flex-wrap items-center gap-3">
            <Button>{copy.primary}</Button>
            <Button variant="secondary">{copy.secondary}</Button>
            <Button variant="ghost">{copy.ghost}</Button>
            <Button disabled>{copy.disabled}</Button>
            <Button loading>{copy.loadingLabel}</Button>
            <Button size="lg">{copy.large}</Button>
            <ButtonLink to="/" variant="secondary">
              {BRAND_COPY[locale].homeLabel}
            </ButtonLink>
          </div>
        </Section>

        <Section title={copy.fields}>
          <div className="grid gap-5 md:grid-cols-2">
            <Input label={copy.nameLabel} hint={copy.nameHint} autoComplete="name" />
            <Input
              label={copy.phoneLabel}
              hint={copy.phoneHint}
              error={copy.phoneError}
              type="tel"
              inputMode="tel"
              dir="ltr"
              autoComplete="tel"
              defaultValue="0770"
            />
          </div>
        </Section>

        <Section title={copy.states}>
          <div className="grid gap-5 md:grid-cols-2">
            <EmptyState
              headingLevel={3}
              title={copy.emptyTitle}
              description={copy.emptyBody}
              action={<ButtonLink to="/">{copy.emptyAction}</ButtonLink>}
            />
            <ErrorState
              error={new ApiError('rate_limited', { status: 429, requestId: 'req_7f3a9c21' })}
              onRetry={() => undefined}
            />
          </div>
          <div role="status" className="grid gap-3 sm:grid-cols-3">
            <span className="sr-only">{BRAND_NAME}</span>
            {[0, 1, 2].map((index) => (
              <Card key={index} className="flex flex-col gap-3">
                <Skeleton className="aspect-square w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </Card>
            ))}
          </div>
        </Section>

        <Section title={copy.api}>
          <ApiStatus copy={copy} />
        </Section>
      </Container>
    </main>
  );
}

export function StyleGuidePage() {
  const [params] = useSearchParams();
  const raw = params.get('lang');
  const locale: Locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  useDocumentLocale(locale);

  return (
    <I18nProvider locale={locale}>
      <StyleGuideContent locale={locale} />
    </I18nProvider>
  );
}
