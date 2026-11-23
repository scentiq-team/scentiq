import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  animatedWebp,
  append,
  avif,
  jpeg,
  lyingPng,
  markAsAnimatedPng,
  png,
  webp,
  withJpegComment,
} from '../../test/images.js';
import { detectImageType } from './detect.js';
import { MediaError, type MediaErrorReason } from './errors.js';
import { MAX_UPLOAD_BYTES, processImage, sanitizeLabel } from './process.js';

const text = (value: string) => new TextEncoder().encode(value);

/** The MediaError a call rejected with (the test fails if the file was accepted). */
async function refusal(promise: Promise<unknown>): Promise<MediaError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(MediaError);
    return error as MediaError;
  }
  throw new Error('The file was accepted, but it should have been refused.');
}
const reasonOf = async (bytes: Uint8Array): Promise<MediaErrorReason> =>
  (await refusal(processImage(bytes))).reason;

describe('what is accepted', () => {
  it('a JPEG becomes WebP variants at the fixed widths, never wider than the source', async () => {
    const result = await processImage(await jpeg(2000, 1000));
    expect(result.variants.map((v) => v.width)).toEqual([480, 960, 1600]);
    expect(result.variants.map((v) => v.height)).toEqual([240, 480, 800]);
    expect(result.width).toBe(1600);
    expect(result.height).toBe(800);
    expect(result.sourceType).toBe('jpeg');
    for (const variant of result.variants) expect(detectImageType(variant.bytes)).toBe('webp');
  });

  it('a 1200 px source gets 480 and 960 only: no variant is an enlargement', async () => {
    const result = await processImage(await jpeg(1200, 900));
    expect(result.variants.map((v) => v.width)).toEqual([480, 960]);
    expect(result.width).toBe(960);
    expect(result.height).toBe(720);
  });

  it('exactly the smallest width is accepted, one pixel less is not', async () => {
    const result = await processImage(await jpeg(480, 480));
    expect(result.variants.map((v) => v.width)).toEqual([480]);
    const error = await refusal(processImage(await jpeg(479, 479)));
    expect(error.reason).toBe('too_small');
    expect(error.details).toEqual({ width: 479, minimum: 480 });
  });

  it('PNG and WebP sources are accepted', async () => {
    expect((await processImage(await png(800, 800))).sourceType).toBe('png');
    expect((await processImage(await webp(800, 800))).sourceType).toBe('webp');
  });

  it('keeps transparency', async () => {
    const result = await processImage(await png(600, 600, { alpha: true }));
    const first = result.variants[0];
    const meta = await sharp(first?.bytes).metadata();
    expect(meta.hasAlpha).toBe(true);
  });

  it('computes a dominant colour as #rrggbb, close to the real colour', async () => {
    const result = await processImage(await jpeg(600, 600, { color: '#cc3322' }));
    expect(result.dominantColor).toMatch(/^#[0-9a-f]{6}$/);
    const [r, g, b] = [1, 3, 5].map((i) =>
      Number.parseInt(result.dominantColor?.slice(i, i + 2) ?? '', 16),
    );
    expect(r).toBeGreaterThan(170);
    expect(g).toBeLessThan(90);
    expect(b).toBeLessThan(90);
  });

  it('is smaller than a JPEG of the same picture: re-encoding is worth doing', async () => {
    const source = await jpeg(1600, 1600);
    const result = await processImage(source);
    const biggest = result.variants.at(-1);
    expect(biggest?.bytes.byteLength).toBeLessThan(source.length * 2);
    expect(biggest?.bytes.byteLength).toBeGreaterThan(0);
  });
});

describe('privacy: what the shop never serves', () => {
  it('drops EXIF, GPS and the copyright string from every variant', async () => {
    const source = await jpeg(1200, 800, { exif: true });
    // Prove the test file really carries them.
    const before = await sharp(source).metadata();
    expect(before.exif?.length).toBeGreaterThan(100);
    expect(source.includes(Buffer.from('secret-owner'))).toBe(true);

    const result = await processImage(source);
    for (const variant of result.variants) {
      const meta = await sharp(variant.bytes).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
      expect(Buffer.from(variant.bytes).includes(Buffer.from('secret-owner'))).toBe(false);
      expect(Buffer.from(variant.bytes).includes(Buffer.from('Exif'))).toBe(false);
    }
  });

  it('applies the EXIF rotation to the pixels instead of keeping the tag', async () => {
    // 1200 wide by 800 tall, flagged "rotate a quarter turn": the shopper sees 800 wide by 1200 tall.
    const result = await processImage(await jpeg(1200, 800, { orientation: 6 }));
    expect(result.variants.map((v) => [v.width, v.height])).toEqual([[480, 720]]);
    expect(await sharp(result.variants[0]?.bytes).metadata()).toMatchObject({
      width: 480,
      height: 720,
    });
  });

  it('the size check uses the rotated width: a tall source flagged sideways can be too narrow', async () => {
    // 800 wide by 400 tall, rotated: 400 wide, narrower than the smallest variant.
    expect(await reasonOf(await jpeg(800, 400, { orientation: 6 }))).toBe('too_small');
  });

  it('never returns the uploaded bytes: a comment in the JPEG does not survive', async () => {
    const source = withJpegComment(await jpeg(800, 800), 'hidden <script>alert(1)</script> note');
    expect(source.includes(Buffer.from('<script>'))).toBe(true);
    const result = await processImage(source);
    for (const variant of result.variants) {
      expect(Buffer.from(variant.bytes).includes(Buffer.from('<script>'))).toBe(false);
      expect(Buffer.from(variant.bytes).includes(Buffer.from('hidden'))).toBe(false);
    }
  });

  it('harmless extra bytes after the image are dropped, not stored', async () => {
    // Camera "motion photo" files carry a video after the picture. No foreign signature: accepted.
    const marker = 'MOTION-PHOTO-BLOCK';
    const source = append(await jpeg(800, 800), marker + 'x'.repeat(5000));
    const result = await processImage(source);
    for (const variant of result.variants) {
      expect(Buffer.from(variant.bytes).includes(Buffer.from(marker))).toBe(false);
    }
  });
});

describe('what is refused, and why', () => {
  it('refuses an empty file', async () => {
    expect(await reasonOf(new Uint8Array(0))).toBe('empty');
  });

  it('refuses a file over the upload limit before reading it', async () => {
    const error = await refusal(processImage(await jpeg(800, 800), { maxBytes: 1000 }));
    expect(error.reason).toBe('too_large');
    expect(error.details).toMatchObject({ limit: 1000 });
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });

  it('accepts a file of exactly the limit', async () => {
    const source = await jpeg(800, 800);
    await expect(processImage(source, { maxBytes: source.length })).resolves.toBeDefined();
  });

  it('refuses a file too short to be anything', async () => {
    expect(await reasonOf((await jpeg(800, 800)).subarray(0, 3))).toBe('unsupported_type');
  });

  describe('files that are not images we accept', () => {
    const cases: [string, Uint8Array | Promise<Uint8Array>, string][] = [
      [
        'SVG',
        text('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"></svg>'),
        'svg',
      ],
      [
        'SVG with a script',
        text('<?xml version="1.0"?><svg onload="alert(1)"><script>fetch("//evil")</script></svg>'),
        'svg',
      ],
      ['PDF', text('%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer'), 'pdf'],
      ['HTML', text('<!DOCTYPE html><html><body><script>alert(1)</script></body></html>'), 'html'],
      ['GIF', text('GIF89a\u0001\u0000\u0001\u0000'), 'gif'],
      ['AVIF', avif(800, 800), 'avif'],
      ['plain text', text('this is not an image at all'), 'unknown'],
    ];
    it.each(cases)('%s', async (_label, bytes, detected) => {
      const error = await refusal(processImage(await bytes));
      expect(error.reason).toBe('unsupported_type');
      expect(error.details).toEqual({ detected });
    });
  });

  it('refuses an iPhone HEIC photo with its own reason (the server cannot decode HEVC)', async () => {
    const heic = await readFile(new URL('../../test/fixtures/hevc-800x600.heic', import.meta.url));
    const error = await refusal(processImage(heic));
    expect(error.reason).toBe('heic_not_supported');
  });

  it('refuses a file with an image signature and no image inside', async () => {
    expect(
      await reasonOf(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), text('garbage')])),
    ).toBe('corrupt');
    const pngHead = (await png(10, 10)).subarray(0, 40);
    expect(await reasonOf(pngHead)).toBe('corrupt');
  });

  it('refuses a truncated JPEG instead of storing half a picture', async () => {
    const image = await jpeg(1200, 1200, { progressive: true });
    expect(await reasonOf(image.subarray(0, Math.floor(image.length / 2)))).toBe('corrupt');
  });

  it('refuses animated images', async () => {
    expect(await reasonOf(markAsAnimatedPng(await png(800, 800)))).toBe('animated_not_supported');
    expect(await reasonOf(await animatedWebp(600, 400))).toBe('animated_not_supported');
  });

  it('never leaks the decoder message', async () => {
    const error = await refusal(
      processImage(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), text('garbage')])),
    );
    expect(error.message).toBe('media: corrupt');
    expect(JSON.stringify(error.details)).not.toMatch(/vips|jpeg|premature/i);
  });
});

describe('decompression bombs', () => {
  it('refuses a header that declares billions of pixels, without decoding anything', async () => {
    const bomb = lyingPng(100_000, 100_000);
    expect(bomb.length).toBeLessThan(200);
    const started = Date.now();
    const error = await refusal(processImage(bomb));
    expect(error.reason).toBe('too_many_pixels');
    expect(Date.now() - started).toBeLessThan(1500);
  });

  it('refuses a real, valid, highly compressed picture over the pixel limit', async () => {
    // 9000 x 6000 = 54 MP of one colour: a few hundred KB of PNG that would need ~160 MB to decode.
    const big = await png(9000, 6000);
    expect(big.length).toBeLessThan(MAX_UPLOAD_BYTES);
    const error = await refusal(processImage(big));
    expect(error.reason).toBe('too_many_pixels');
  }, 30_000);

  it('the limit is exact: at the limit is accepted, one pixel over is not', async () => {
    const source = await jpeg(1000, 800); // 800 000 pixels
    await expect(processImage(source, { maxPixels: 800_000 })).resolves.toBeDefined();
    expect((await refusal(processImage(source, { maxPixels: 799_999 }))).reason).toBe(
      'too_many_pixels',
    );
  });

  it('refuses a small file whose header lies about a modest size and has no pixels', async () => {
    expect(await reasonOf(lyingPng(4000, 4000))).toBe('corrupt');
  });
});

describe('polyglots: one file, two formats', () => {
  it.each([
    [
      'a JPEG that is also a PDF',
      async () => append(await jpeg(800, 800), '%PDF-1.7\n1 0 obj\n<<>>\nendobj'),
    ],
    [
      'a JPEG with a ZIP behind it',
      async () => append(await jpeg(800, 800), 'PK\u0003\u0004\u0014\u0000'),
    ],
    [
      'a PNG with a script behind it',
      async () => append(await png(800, 800), '<script>alert(1)</script>'),
    ],
    [
      'a PNG with an SVG behind it',
      async () => append(await png(800, 800), '<svg onload="x()"></svg>'),
    ],
    [
      'a WebP with an HTML page behind it',
      async () => append(await webp(800, 800), '<!DOCTYPE html><html></html>'),
    ],
    [
      'a JPEG with PHP behind it',
      async () => append(await jpeg(800, 800), '<?php eval($_POST[1]); ?>'),
    ],
    [
      'a JPEG with an executable behind it',
      async () => append(await jpeg(800, 800), '\u007fELF\u0002\u0001\u0001'),
    ],
  ])('refuses %s', async (_label, build) => {
    const error = await refusal(processImage(await build()));
    expect(error.reason).toBe('polyglot_suspected');
    expect(error.details).toHaveProperty('trailingBytes');
  });

  it('a signature INSIDE the picture data is not trailing data and is removed by the re-encode', async () => {
    const source = withJpegComment(await jpeg(800, 800), '%PDF-1.7 <svg onload=x()>');
    const result = await processImage(source);
    for (const variant of result.variants) {
      expect(Buffer.from(variant.bytes).includes(Buffer.from('%PDF'))).toBe(false);
      expect(Buffer.from(variant.bytes).includes(Buffer.from('<svg'))).toBe(false);
    }
  });
});

describe('sanitizeLabel', () => {
  it.each([
    ['a plain name', 'photo.jpg', 'photo.jpg'],
    ['an Arabic name', 'عطر ورد.jpg', 'عطر ورد.jpg'],
    ['a Unix path', '../../etc/passwd.jpg', 'passwd.jpg'],
    ['a Windows path', 'C:\\Users\\me\\Pictures\\bottle.png', 'bottle.png'],
    ['leading dots', '.htaccess', 'htaccess'],
    ['control characters', 'pho\u0000to\u001f\n.jpg', 'photo.jpg'],
    ['a right-to-left override', 'photo\u202egpj.exe', 'photogpj.exe'],
    ['zero-width characters', 'ph\u200boto\ufeff.jpg', 'photo.jpg'],
    ['runs of spaces', '  my   bottle \t photo.jpg  ', 'my bottle photo.jpg'],
    ['a composed accent', 'cafe\u0301.jpg', 'caf\u00e9.jpg'],
  ])('%s', (_label, input, expected) => {
    expect(sanitizeLabel(input)).toBe(expected);
  });

  it.each([undefined, null, '', '   ', '...', '../', '\u202e'])(
    '%j has no usable name',
    (input) => {
      expect(sanitizeLabel(input)).toBeNull();
    },
  );

  it('copes with an enormous name, and still finds the file name at the end of a long path', () => {
    const started = Date.now();
    const huge = `${'../'.repeat(2_000_000)}final-name.jpg`;
    expect(sanitizeLabel(huge)).toBe('final-name.jpg');
    expect(sanitizeLabel('x'.repeat(5_000_000))?.length).toBe(200);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('never returns a lone surrogate', () => {
    // 2049 characters ending in an emoji: the cut at 2048 characters keeps the emoji whole, but a
    // name that STARTS with half an emoji after the cut must lose it.
    const cut = `\u{1F600}${'a'.repeat(2047)}`; // 2049 UTF-16 units; the tail keeps 2048: half an emoji + a's
    const label = sanitizeLabel(cut);
    expect(label).toBe('a'.repeat(200));
    expect(label).not.toMatch(/[\ud800-\udfff]/);
  });

  it('keeps at most 200 characters, counting letters not bytes', () => {
    const long = sanitizeLabel('ع'.repeat(300));
    expect(Array.from(long ?? '').length).toBe(200);
    expect(sanitizeLabel('a'.repeat(300))?.length).toBe(200);
  });
});
