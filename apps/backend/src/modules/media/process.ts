// Turns an uploaded file into the images the shop serves (ADR-0009). The uploaded bytes are NEVER
// stored or served: every accepted image is decoded and re-encoded as WebP at fixed widths, which
// drops everything that was not pixels (EXIF and GPS, ICC quirks, comments, trailing data, any
// second format hiding in the file).
//
// Order matters, cheapest and safest check first:
//   1. size                      before anything reads the bytes
//   2. magic bytes               what the file really is (never the extension or Content-Type)
//   3. structure                 trailing data after the image end, animated PNG
//   4. header (no decode)        declared pixels against the limit, the smallest width
//   5. decode and re-encode      under the pixel limit, one variant at a time

import { MEDIA_VARIANT_WIDTHS } from '@scentiq/shared';
import sharp from 'sharp';
import { type AllowedType, detectImageType, isAllowedType } from './detect.js';
import { MediaError } from './errors.js';
import { findImageEnd, readPngStructure, trailingDataLooksForeign } from './trailing.js';

/** The largest upload accepted. A product photo from a phone is 2 to 6 MB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/**
 * The most pixels a source may declare. 50 MP covers every phone camera; decoding it needs about
 * 150 to 200 MB, which is why the limit exists: a 40 KB PNG can declare billions of pixels.
 */
export const MAX_SOURCE_PIXELS = 50_000_000;
/** How much of an uploaded file name is looked at. */
const MAX_LABEL_INPUT = 2048;
/** Half of an emoji or other astral character, left alone after a cut. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
/** WebP quality for product photos: visually clean at a fraction of the JPEG size. */
export const WEBP_QUALITY = 82;

export interface ProcessedVariant {
  width: number;
  height: number;
  bytes: Uint8Array;
}

export interface ProcessedImage {
  /** Ascending by width. Never wider than the source. */
  variants: ProcessedVariant[];
  /** The largest variant. */
  width: number;
  height: number;
  /** `#rrggbb`, shown while the image loads; null when it could not be computed. */
  dominantColor: string | null;
  /** What the upload really was. */
  sourceType: AllowedType;
}

export interface ProcessOptions {
  maxBytes?: number;
  maxPixels?: number;
}

const toHex = (value: number): string =>
  Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0');

async function dominantColorOf(bytes: Uint8Array): Promise<string | null> {
  try {
    const { dominant } = await sharp(bytes).stats();
    return `#${toHex(dominant.r)}${toHex(dominant.g)}${toHex(dominant.b)}`;
  } catch {
    // The colour is a nicety: failing to compute it must not fail an upload.
    return null;
  }
}

const isPixelLimitError = (error: unknown): boolean =>
  error instanceof Error && /pixel limit/i.test(error.message);

export async function processImage(
  bytes: Uint8Array,
  options: ProcessOptions = {},
): Promise<ProcessedImage> {
  const maxBytes = options.maxBytes ?? MAX_UPLOAD_BYTES;
  const maxPixels = options.maxPixels ?? MAX_SOURCE_PIXELS;

  // 1. Size.
  if (bytes.byteLength === 0) throw new MediaError('empty');
  if (bytes.byteLength > maxBytes) {
    throw new MediaError('too_large', { size: bytes.byteLength, limit: maxBytes });
  }

  // 2. What the file really is.
  const detected = detectImageType(bytes);
  if (detected === 'heic') throw new MediaError('heic_not_supported');
  if (!isAllowedType(detected)) throw new MediaError('unsupported_type', { detected });

  // 3. Structure: another format after the image, or an animation.
  if (detected === 'png' && readPngStructure(bytes).animated) {
    throw new MediaError('animated_not_supported');
  }
  const end = findImageEnd(bytes, detected);
  if (end !== undefined && end < bytes.byteLength) {
    if (trailingDataLooksForeign(bytes.subarray(end))) {
      throw new MediaError('polyglot_suspected', { trailingBytes: bytes.byteLength - end });
    }
  }

  // 4. The header, without decoding any pixels.
  const input = { limitInputPixels: maxPixels, failOn: 'error', animated: false } as const;
  let sourceWidth: number;
  let sourceHeight: number;
  try {
    const meta = await sharp(bytes, input).metadata();
    // The signature said one format; the decoder must agree.
    if (meta.format !== detected) throw new MediaError('corrupt', { detected });
    if ((meta.pages ?? 1) > 1) throw new MediaError('animated_not_supported');
    if (meta.width === undefined || meta.height === undefined) throw new MediaError('corrupt');
    // EXIF orientations 5 to 8 turn the picture a quarter turn: what a shopper sees is rotated.
    const turned = (meta.orientation ?? 1) >= 5;
    sourceWidth = turned ? meta.height : meta.width;
    sourceHeight = turned ? meta.width : meta.height;
  } catch (error) {
    if (error instanceof MediaError) throw error;
    if (isPixelLimitError(error)) throw new MediaError('too_many_pixels', { limit: maxPixels });
    throw new MediaError('corrupt', {}, { cause: error });
  }
  if (sourceWidth * sourceHeight > maxPixels) {
    throw new MediaError('too_many_pixels', {
      pixels: sourceWidth * sourceHeight,
      limit: maxPixels,
    });
  }
  const smallest = MEDIA_VARIANT_WIDTHS[0];
  if (sourceWidth < smallest) {
    throw new MediaError('too_small', { width: sourceWidth, minimum: smallest });
  }

  // 5. Decode once per variant and re-encode. Sequential: three decodes at once would triple the
  // memory a single upload can use.
  const widths = MEDIA_VARIANT_WIDTHS.filter((width) => width <= sourceWidth);
  const variants: ProcessedVariant[] = [];
  try {
    for (const width of widths) {
      const { data, info } = await sharp(bytes, input)
        .rotate() // applies the EXIF orientation to the pixels, then the tag is gone
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer({ resolveWithObject: true });
      variants.push({ width: info.width, height: info.height, bytes: data });
    }
  } catch (error) {
    if (isPixelLimitError(error)) throw new MediaError('too_many_pixels', { limit: maxPixels });
    throw new MediaError('corrupt', {}, { cause: error });
  }

  const largest = variants.at(-1);
  const first = variants[0];
  if (largest === undefined || first === undefined) throw new MediaError('corrupt');
  return {
    variants,
    width: largest.width,
    height: largest.height,
    dominantColor: await dominantColorOf(first.bytes),
    sourceType: detected,
  };
}

/**
 * A file name made safe to show in Studio: no folders, no control or direction-changing characters,
 * no leading dots, at most 200 characters. Display only: it never reaches a path.
 */
export function sanitizeLabel(name: string | undefined | null): string | null {
  if (name === undefined || name === null) return null;
  // The name is the sender's. Work on its tail only (a file name sits at the end of a path), so a
  // multi-megabyte "name" costs nothing; `toWellFormed` replaces a surrogate cut in half.
  const cleaned = name
    .slice(-MAX_LABEL_INPUT)
    .replace(LONE_SURROGATE, '')
    .normalize('NFC')
    // Folders: keep what follows the last slash or backslash.
    .replace(/^.*[\\/]/s, '')
    // Control characters, and the invisible ones that reorder or hide text (bidi marks and
    // overrides, zero-width characters, the byte-order mark).
    // biome-ignore lint/suspicious/noControlCharactersInRegex: removing control characters is the point
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim();
  if (cleaned === '') return null;
  const characters = Array.from(cleaned);
  return characters.length > 200 ? characters.slice(0, 200).join('').trim() : cleaned;
}
