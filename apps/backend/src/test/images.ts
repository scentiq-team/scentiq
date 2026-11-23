// Small images and hand-made hostile files for the media tests. Everything is generated here, so no
// binary fixture needs to be trusted (the one exception is the HEIC file, which the sandbox
// cannot encode: see `fixtures/hevc-800x600.heic`).

import { crc32, deflateSync } from 'node:zlib';
import sharp, { type Color } from 'sharp';

const solid = (width: number, height: number, color: Color, alpha = false) => ({
  create: { width, height, channels: alpha ? (4 as const) : (3 as const), background: color },
});

export interface JpegOptions {
  /** EXIF orientation tag, 1 to 8. */
  orientation?: number;
  /** Write a copyright string and GPS coordinates into EXIF. */
  exif?: boolean;
  progressive?: boolean;
  color?: string;
}

export function jpeg(width: number, height: number, options: JpegOptions = {}): Promise<Buffer> {
  let image = sharp(solid(width, height, options.color ?? '#cc3322')).jpeg({
    progressive: options.progressive ?? false,
  });
  if (options.exif) {
    image = image.withExif({
      IFD0: { Copyright: 'secret-owner' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '51/1 30/1 0/1',
        GPSLongitudeRef: 'W',
        GPSLongitude: '0/1 7/1 0/1',
      },
    });
  }
  if (options.orientation !== undefined)
    image = image.withMetadata({ orientation: options.orientation });
  return image.toBuffer();
}

export function png(
  width: number,
  height: number,
  options: { alpha?: boolean } = {},
): Promise<Buffer> {
  const alpha = options.alpha ?? false;
  return sharp(
    solid(width, height, alpha ? { r: 20, g: 120, b: 220, alpha: 0.5 } : '#2060c0', alpha),
  )
    .png()
    .toBuffer();
}

export function webp(width: number, height: number): Promise<Buffer> {
  return sharp(solid(width, height, '#22aa66'))
    .webp()
    .toBuffer();
}

export function avif(width: number, height: number): Promise<Buffer> {
  return sharp(solid(width, height, '#22aa66'))
    .avif()
    .toBuffer();
}

/** Two frames: an animated WebP. */
export async function animatedWebp(width: number, height: number): Promise<Buffer> {
  const frame = (color: string) =>
    sharp(solid(width, height, color))
      .raw()
      .toBuffer();
  const both = Buffer.concat([await frame('#ffffff'), await frame('#000000')]);
  return sharp(both, { raw: { width, height: height * 2, channels: 3, pageHeight: height } })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
}

/** One PNG chunk: length, type, data, CRC. */
export function pngChunk(type: string, data: Uint8Array = new Uint8Array(0)): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * A PNG whose header DECLARES `width` x `height` pixels but whose pixel data is a few bytes: the
 * shape of a decompression bomb, without the memory cost of building a real one.
 */
export function lyingPng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.alloc(16))),
    pngChunk('IEND'),
  ]);
}

/** Inserts an `acTL` chunk (animation control) after the header: an APNG marker. */
export function markAsAnimatedPng(source: Buffer): Buffer {
  const afterHeader = 8 + 25;
  const control = Buffer.alloc(8);
  control.writeUInt32BE(2, 0); // frames
  return Buffer.concat([
    source.subarray(0, afterHeader),
    pngChunk('acTL', control),
    source.subarray(afterHeader),
  ]);
}

/** A JPEG with an extra comment segment (COM): where a script or a note can hide inside the file. */
export function withJpegComment(source: Buffer, comment: string): Buffer {
  const text = Buffer.from(comment, 'latin1');
  const segment = Buffer.alloc(4);
  segment[0] = 0xff;
  segment[1] = 0xfe;
  segment.writeUInt16BE(text.length + 2, 2);
  return Buffer.concat([source.subarray(0, 2), segment, text, source.subarray(2)]);
}

export const append = (image: Buffer, extra: string | Uint8Array): Buffer =>
  Buffer.concat([image, typeof extra === 'string' ? Buffer.from(extra, 'latin1') : extra]);
