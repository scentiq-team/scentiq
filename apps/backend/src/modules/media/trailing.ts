// Bytes that sit AFTER the end of an image (ADR-0009). A polyglot is one file that is a valid image
// and also something else (a PDF, a ZIP, an HTML page): the something else hides after the image
// data. We never store or serve the uploaded bytes (every image is decoded and re-encoded), so a
// polyglot cannot survive the pipeline. Refusing the ones that carry another format's signature is a
// second layer and a clear message for the uploader; harmless trailing data (a camera's extra
// block) is simply dropped by the re-encode.
//
// Pure and dependency-free: it reads the structure of JPEG, PNG and WebP just far enough to find
// where the image ends.

import type { AllowedType } from './detect.js';

const u32be = (b: Uint8Array, at: number): number =>
  ((b[at] ?? 0) * 0x1000000 +
    ((b[at + 1] ?? 0) << 16) +
    ((b[at + 2] ?? 0) << 8) +
    (b[at + 3] ?? 0)) >>>
  0;
const u32le = (b: Uint8Array, at: number): number =>
  ((b[at + 3] ?? 0) * 0x1000000 +
    ((b[at + 2] ?? 0) << 16) +
    ((b[at + 1] ?? 0) << 8) +
    (b[at] ?? 0)) >>>
  0;
const ascii = (b: Uint8Array, start: number, end: number): string =>
  String.fromCharCode(...b.subarray(start, end));

/** Offset just after the last byte of a JPEG (its EOI marker), or undefined if the markers do not parse. */
export function findJpegEnd(bytes: Uint8Array): number | undefined {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let i = 2;
  while (i < bytes.length) {
    // Skip fill bytes, then read a marker.
    if (bytes[i] !== 0xff) return undefined;
    while (bytes[i] === 0xff) i += 1;
    const marker = bytes[i];
    if (marker === undefined) return undefined;
    i += 1;
    if (marker === 0xd9) return i; // EOI
    // Markers with no length: TEM, RSTn, SOI.
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 2 > bytes.length) return undefined;
    const length = ((bytes[i] ?? 0) << 8) + (bytes[i + 1] ?? 0);
    if (length < 2) return undefined;
    i += length;
    if (marker === 0xda) {
      // Start of scan: entropy-coded data follows until the next real marker. 0xFF00 is an escaped
      // data byte and 0xFFD0-D7 are restart markers; anything else ends the scan.
      while (i < bytes.length) {
        if (bytes[i] !== 0xff) {
          i += 1;
          continue;
        }
        const next = bytes[i + 1];
        if (next === undefined) return undefined;
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7) || next === 0xff) {
          i += next === 0xff ? 1 : 2;
          continue;
        }
        break;
      }
    }
  }
  return undefined;
}

export interface PngStructure {
  /** Offset just after the IEND chunk, or undefined if the chunks do not parse. */
  end: number | undefined;
  /** An `acTL` chunk: an animated PNG. */
  animated: boolean;
}

export function readPngStructure(bytes: Uint8Array): PngStructure {
  let i = 8;
  let animated = false;
  while (i + 12 <= bytes.length) {
    const length = u32be(bytes, i);
    const type = ascii(bytes, i + 4, i + 8);
    if (type === 'acTL') animated = true;
    const next = i + 12 + length;
    if (next > bytes.length) return { end: undefined, animated };
    if (type === 'IEND') return { end: next, animated };
    i = next;
  }
  return { end: undefined, animated };
}

/** Offset just after the RIFF container of a WebP, from its own size field. */
export function findWebpEnd(bytes: Uint8Array): number | undefined {
  if (bytes.length < 12) return undefined;
  const end = 8 + u32le(bytes, 4);
  return end <= bytes.length ? end : undefined;
}

/** Where the image data ends, when the structure can be read. */
export function findImageEnd(bytes: Uint8Array, type: AllowedType): number | undefined {
  if (type === 'jpeg') return findJpegEnd(bytes);
  if (type === 'png') return readPngStructure(bytes).end;
  return findWebpEnd(bytes);
}

/**
 * Signatures of other formats, as they would start a hidden file. Checked only in trailing data, and
 * only signatures of four bytes or more: a camera's extra block can be megabytes of binary, and a
 * shorter pattern would match it by chance.
 */
const BINARY_SIGNATURES: readonly (readonly number[])[] = [
  [0x50, 0x4b, 0x03, 0x04], // ZIP, JAR, OOXML, APK
  [0x50, 0x4b, 0x05, 0x06], // empty ZIP
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0x52, 0x61, 0x72, 0x21], // RAR
  [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], // 7z
  [0x4d, 0x5a, 0x90, 0x00], // Windows executable
];

const TEXT_SIGNATURES = [
  '%pdf-',
  '<svg',
  '<script',
  '<html',
  '<!doctype html',
  '<?php',
  '<?xml',
] as const;

/**
 * True when the trailing bytes carry another format's signature, anywhere in them (a hidden archive
 * is found by scanning, since ZIP readers look for their records from the end of the file).
 */
export function trailingDataLooksForeign(trailing: Uint8Array): boolean {
  if (trailing.length === 0) return false;
  const buffer = Buffer.from(trailing.buffer, trailing.byteOffset, trailing.byteLength);
  const text = buffer.toString('latin1').toLowerCase();
  if (TEXT_SIGNATURES.some((signature) => text.includes(signature))) return true;
  return BINARY_SIGNATURES.some((signature) => buffer.includes(Buffer.from(signature)));
}
