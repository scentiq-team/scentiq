import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  HEAD_MARKER,
  jsonLdScript,
  ROOT_MARKER,
  renderHead,
  renderShell,
} from './html.js';
import type { PageModel } from './types.js';

const page: PageModel = {
  status: 200,
  locale: 'ar',
  title: 'عطر | ScentIQ',
  description: 'وصف',
  canonical: 'https://scentiq.example/p/test',
  robots: 'index,follow',
  alternates: [
    { hreflang: 'ar', href: 'https://scentiq.example/p/test' },
    { hreflang: 'en', href: 'https://scentiq.example/en/p/test' },
  ],
  ogType: 'product',
  jsonLd: [{ '@context': 'https://schema.org', '@type': 'Product', name: 'x' }],
  bodyHtml: '<main><h1>عطر</h1></main>',
};

const template = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<title>Old title</title>
${HEAD_MARKER}
</head>
<body><div id="root">${ROOT_MARKER}</div></body>
</html>`;

describe('escapeHtml', () => {
  it('escapes every character that can break out of text or attributes', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('jsonLdScript', () => {
  it('cannot be closed early by a value containing </script>', () => {
    const html = jsonLdScript({ name: '</script><script>alert(1)</script>' });
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).not.toContain('<script>alert');
  });

  it('round-trips the original data', () => {
    const html = jsonLdScript({ name: 'a < b & c > d', n: 1 });
    const json = html.replace('<script type="application/ld+json">', '').replace('</script>', '');
    expect(JSON.parse(json)).toEqual({ name: 'a < b & c > d', n: 1 });
  });
});

describe('renderHead', () => {
  const head = renderHead(page, 'https://scentiq.example', 'ScentIQ');

  it('contains title, description, robots, canonical and hreflang links', () => {
    expect(head).toContain('<title>عطر | ScentIQ</title>');
    expect(head).toContain('<meta name="description" content="وصف">');
    expect(head).toContain('<meta name="robots" content="index,follow">');
    expect(head).toContain('<link rel="canonical" href="https://scentiq.example/p/test">');
    expect(head).toContain('hreflang="en" href="https://scentiq.example/en/p/test"');
  });

  it('contains Open Graph tags and JSON-LD', () => {
    expect(head).toContain('<meta property="og:type" content="product">');
    expect(head).toContain('<meta property="og:locale" content="ar_IQ">');
    expect(head).toContain('<meta property="og:url" content="https://scentiq.example/p/test">');
    expect(head).toContain('content="https://scentiq.example/og-default.png"');
    expect(head).toContain('<script type="application/ld+json">');
  });

  it('omits canonical and og:url when a page has no canonical', () => {
    const { canonical: _unused, ...withoutCanonical } = page;
    const notFound = renderHead(
      { ...withoutCanonical, status: 404 },
      'https://x.example',
      'ScentIQ',
    );
    expect(notFound).not.toContain('rel="canonical"');
    expect(notFound).not.toContain('og:url');
  });

  it('escapes hostile text in titles and descriptions', () => {
    const hostile = renderHead(
      { ...page, title: '"><script>alert(1)</script>', description: `' onload='x` },
      'https://x.example',
      'ScentIQ',
    );
    expect(hostile).not.toContain('<script>alert(1)</script>');
    expect(hostile).not.toContain(`' onload='x`);
  });
});

describe('renderShell', () => {
  const head = '<title>New</title>';

  it('replaces the title, sets lang and dir, and fills both markers', () => {
    const html = renderShell(template, { ...page, locale: 'en' }, head);
    expect(html).toContain('<html lang="en" dir="ltr">');
    expect(html).not.toContain('Old title');
    expect(html).toContain('<title>New</title>');
    expect(html).toContain('<div id="root"><main><h1>عطر</h1></main></div>');
    expect(html).not.toContain(HEAD_MARKER);
    expect(html).not.toContain(ROOT_MARKER);
  });

  it('uses rtl for Arabic', () => {
    expect(renderShell(template, page, head)).toContain('<html lang="ar" dir="rtl">');
  });

  it('does not interpret $ patterns in content as replacement syntax', () => {
    const html = renderShell(template, { ...page, bodyHtml: '<p>$& $1 $$ $`</p>' }, head);
    expect(html).toContain('<p>$& $1 $$ $`</p>');
  });
});
