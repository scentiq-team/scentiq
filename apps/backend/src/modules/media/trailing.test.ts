import { describe, expect, it } from 'vitest';
import { animatedWebp, append, jpeg, markAsAnimatedPng, png, webp } from '../../test/images.js';
import {
  findImageEnd,
  findJpegEnd,
  findWebpEnd,
  readPngStructure,
  trailingDataLooksForeign,
} from './trailing.js';

const text = (value: string) => new TextEncoder().encode(value);

describe('where an image ends', () => {
  it.each([
    ['baseline', { progressive: false }],
    ['progressive (many scans)', { progressive: true }],
    ['with EXIF', { exif: true }],
  ])('a clean %s JPEG ends at its last byte', async (_label, options) => {
    const image = await jpeg(640, 480, options);
    expect(findJpegEnd(image)).toBe(image.length);
  });

  it('a JPEG with data appended ends before the extra data', async () => {
    const image = await jpeg(64, 64);
    expect(findJpegEnd(append(image, 'extra bytes'))).toBe(image.length);
  });

  it('an appended file that itself contains a JPEG end marker does not move the end', async () => {
    const image = await jpeg(64, 64);
    const second = await jpeg(32, 32);
    expect(findJpegEnd(Buffer.concat([image, second]))).toBe(image.length);
  });

  it('a truncated JPEG has no end', async () => {
    const image = await jpeg(640, 480);
    expect(findJpegEnd(image.subarray(0, image.length - 20))).toBeUndefined();
  });

  it('not a JPEG, no end', () => {
    expect(findJpegEnd(text('hello'))).toBeUndefined();
  });

  it('a clean PNG ends at its last byte, and is not animated', async () => {
    const image = await png(100, 100);
    expect(readPngStructure(image)).toEqual({ end: image.length, animated: false });
  });

  it('a PNG with data appended ends before it', async () => {
    const image = await png(100, 100);
    expect(readPngStructure(append(image, 'tail')).end).toBe(image.length);
  });

  it('an acTL chunk marks a PNG as animated', async () => {
    const image = markAsAnimatedPng(await png(100, 100));
    expect(readPngStructure(image).animated).toBe(true);
  });

  it('a truncated PNG has no end', async () => {
    const image = await png(100, 100);
    expect(readPngStructure(image.subarray(0, image.length - 6)).end).toBeUndefined();
  });

  it('a clean WebP ends at its last byte; appended data is after the RIFF size', async () => {
    const image = await webp(100, 100);
    expect(findWebpEnd(image)).toBe(image.length);
    expect(findWebpEnd(append(image, 'tail'))).toBe(image.length);
  });

  it('a WebP that claims more than it has is truncated', async () => {
    const image = await webp(100, 100);
    expect(findWebpEnd(image.subarray(0, image.length - 5))).toBeUndefined();
    expect(findWebpEnd(text('RIFF'))).toBeUndefined();
  });

  it('findImageEnd picks the right reader for the type', async () => {
    const [j, p, w] = [await jpeg(64, 64), await png(64, 64), await webp(64, 64)];
    expect(findImageEnd(j, 'jpeg')).toBe(j.length);
    expect(findImageEnd(p, 'png')).toBe(p.length);
    expect(findImageEnd(w, 'webp')).toBe(w.length);
  });

  it('an animated WebP is built the way the decoder test expects', async () => {
    const image = await animatedWebp(480, 100);
    expect(findWebpEnd(image)).toBe(image.length);
  });
});

describe('trailingDataLooksForeign', () => {
  it.each([
    ['a PDF', '%PDF-1.7 1 0 obj'],
    ['a PDF in capitals', '%pdf-1.4'],
    ['an SVG', '<svg onload="alert(1)"></svg>'],
    ['a script', 'padding <script>alert(1)</script>'],
    ['an HTML page', '<!DOCTYPE html><html></html>'],
    ['PHP', '<?php system($_GET[0]); ?>'],
    ['an XML prolog', '<?xml version="1.0"?>'],
    ['a ZIP record', 'PK\u0003\u0004rest of archive'],
    ['an empty ZIP', 'PK\u0005\u0006'],
    ['an ELF binary', '\u007fELF\u0002\u0001'],
    ['a RAR archive', 'Rar!\u001a\u0007'],
  ])('%s hidden after the image', (_label, content) => {
    expect(trailingDataLooksForeign(Buffer.from(`xx${content}`, 'latin1'))).toBe(true);
  });

  it('finds a signature in the middle of a long block, not only at its start', () => {
    const block = Buffer.concat([Buffer.alloc(100_000), Buffer.from('<script>'), Buffer.alloc(10)]);
    expect(trailingDataLooksForeign(block)).toBe(true);
  });

  it('empty and harmless trailing data are not foreign', () => {
    expect(trailingDataLooksForeign(new Uint8Array(0))).toBe(false);
    expect(trailingDataLooksForeign(text('some padding bytes'))).toBe(false);
    expect(trailingDataLooksForeign(Buffer.alloc(1000))).toBe(false);
  });

  it('a large block of ordinary binary data (a camera extra block) is not foreign', () => {
    // A deterministic stream of bytes from 0x00 to 0x30: none of them starts a known signature.
    const block = Buffer.alloc(4 * 1024 * 1024);
    let state = 0x2545f491;
    for (let i = 0; i < block.length; i += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      block[i] = (state >>> 0) % 0x30;
    }
    expect(trailingDataLooksForeign(block)).toBe(false);
  });
});
