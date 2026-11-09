// What a file REALLY is, from its first bytes (ADR-0009). Never from the extension, never from the
// Content-Type header: both are chosen by the sender. Pure and dependency-free.

export type DetectedType =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'gif'
  | 'avif'
  | 'heic'
  | 'svg'
  | 'pdf'
  | 'html'
  | 'unknown';

/** The only types an upload may be (ADR-0009). Everything else is refused. */
export const ALLOWED_TYPES = ['jpeg', 'png', 'webp'] as const satisfies readonly DetectedType[];
export type AllowedType = (typeof ALLOWED_TYPES)[number];

export const isAllowedType = (type: DetectedType): type is AllowedType =>
  (ALLOWED_TYPES as readonly string[]).includes(type);

const ascii = (bytes: Uint8Array, start: number, end: number): string =>
  String.fromCharCode(...bytes.subarray(start, end));

/** Brands of the ISO base media format that mean "HEIF image with HEVC": iPhone photos. */
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);
/** Generic HEIF brands: the real codec is inside the file, so they are treated as HEIC too. */
const HEIF_GENERIC_BRANDS = new Set(['mif1', 'msf1']);

/**
 * Text formats are recognised by looking at the start of the file after a byte-order mark and
 * whitespace. SVG is a document that can carry script, which is why it is never accepted.
 */
function sniffText(bytes: Uint8Array): DetectedType | undefined {
  let start = 0;
  // UTF-8 BOM, then whitespace.
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  while (start < bytes.length && [0x20, 0x09, 0x0a, 0x0d].includes(bytes[start] ?? 0)) start += 1;

  const head = ascii(bytes, start, Math.min(bytes.length, start + 2048)).toLowerCase();
  if (head.startsWith('%pdf-')) return 'pdf';
  if (head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!doctype svg')) {
    return head.includes('<svg') ? 'svg' : undefined;
  }
  if (head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<script')) {
    return 'html';
  }
  return undefined;
}

export function detectImageType(bytes: Uint8Array): DetectedType {
  if (bytes.length < 4) return 'unknown';

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 4) === 'PNG' &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return 'webp';
  }
  if (ascii(bytes, 0, 4) === 'GIF8') return 'gif';
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'avif';
    if (HEIC_BRANDS.has(brand) || HEIF_GENERIC_BRANDS.has(brand)) return 'heic';
  }
  return sniffText(bytes) ?? 'unknown';
}
