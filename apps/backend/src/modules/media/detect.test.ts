import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { avif, jpeg, png, webp } from '../../test/images.js';
import { ALLOWED_TYPES, detectImageType, isAllowedType } from './detect.js';

const text = (value: string) => new TextEncoder().encode(value);

describe('detectImageType: by the first bytes, never by name', () => {
  it('recognises the three accepted formats', async () => {
    expect(detectImageType(await jpeg(8, 8))).toBe('jpeg');
    expect(detectImageType(await png(8, 8))).toBe('png');
    expect(detectImageType(await webp(8, 8))).toBe('webp');
  });

  it('recognises formats that are refused, so the caller can say why', async () => {
    expect(detectImageType(await avif(16, 16))).toBe('avif');
    expect(detectImageType(text('GIF89a......'))).toBe('gif');
    const heic = await readFile(new URL('../../test/fixtures/hevc-800x600.heic', import.meta.url));
    expect(detectImageType(heic)).toBe('heic');
  });

  it.each([
    ['heic', 'heic'],
    ['heix', 'heic'],
    ['hevc', 'heic'],
    ['mif1', 'heic'],
    ['msf1', 'heic'],
    ['avif', 'avif'],
    ['avis', 'avif'],
  ] as const)('ISO media brand %s is %s', (brand, expected) => {
    const bytes = new Uint8Array(32);
    bytes.set(text('ftyp'), 4);
    bytes.set(text(brand), 8);
    expect(detectImageType(bytes)).toBe(expected);
  });

  it('an ftyp brand that is not an image (an MP4 video) is unknown', () => {
    const bytes = new Uint8Array(32);
    bytes.set(text('ftyp'), 4);
    bytes.set(text('isom'), 8);
    expect(detectImageType(bytes)).toBe('unknown');
  });

  it.each([
    ['plain SVG', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'svg'],
    ['SVG with an XML prolog', '<?xml version="1.0"?>\n<svg viewBox="0 0 1 1"></svg>', 'svg'],
    ['SVG after whitespace', '  \n\t<svg></svg>', 'svg'],
    ['SVG in capitals', '<SVG></SVG>', 'svg'],
    ['SVG with a doctype', '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN"><svg></svg>', 'svg'],
    ['PDF', '%PDF-1.7\n1 0 obj', 'pdf'],
    ['PDF after whitespace', '\n\n%PDF-1.4', 'pdf'],
    ['HTML document', '<!DOCTYPE html><html><body>hi</body></html>', 'html'],
    ['HTML without a doctype', '<html><script>x</script></html>', 'html'],
    ['a bare script tag', '<script>alert(1)</script>', 'html'],
  ] as const)('%s', (_label, content, expected) => {
    expect(detectImageType(text(content))).toBe(expected);
  });

  it('sees through a UTF-8 byte-order mark', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...text('<svg></svg>')]);
    expect(detectImageType(bytes)).toBe('svg');
  });

  it('an XML file that is not SVG is unknown', () => {
    expect(detectImageType(text('<?xml version="1.0"?><note>hello</note>'))).toBe('unknown');
  });

  it.each([
    ['empty', new Uint8Array(0)],
    ['three bytes', new Uint8Array([0xff, 0xd8, 0xff])],
    ['random text', text('just some words in a file')],
    ['a truncated PNG signature', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])],
    ['RIFF that is not WebP', text('RIFF....WAVEfmt ')],
  ])('%s is unknown', (_label, bytes) => {
    expect(detectImageType(bytes)).toBe('unknown');
  });

  it('a JPEG signature wins over what follows it', () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8, 0xff, ...text('<svg>')]))).toBe('jpeg');
  });
});

describe('the allow-list', () => {
  it('is exactly JPEG, PNG and WebP', () => {
    expect([...ALLOWED_TYPES]).toEqual(['jpeg', 'png', 'webp']);
  });

  it.each(['jpeg', 'png', 'webp'] as const)('%s is allowed', (type) => {
    expect(isAllowedType(type)).toBe(true);
  });

  it.each(['gif', 'avif', 'heic', 'svg', 'pdf', 'html', 'unknown'] as const)(
    '%s is not allowed',
    (type) => {
      expect(isAllowedType(type)).toBe(false);
    },
  );
});
