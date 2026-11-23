// Placeholder product photos for `seed:dev`: a soft gradient and a plain bottle shape, no text and
// nothing that looks like a real product photo. They go through the SAME upload pipeline as a real
// photo (decode, re-encode to WebP variants), so seeding also exercises the media library.
//
// The SVG here is our own constant markup, rendered once to a PNG; an uploaded SVG is still refused.

import sharp from 'sharp';

const SIZE = 1600;

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const hex = (value: number) =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(channel(0))}${hex(channel(8))}${hex(channel(4))}`;
}

/** The hue (0 to 359) used for the nth placeholder: neighbours differ a lot, so a grid looks varied. */
export const placeholderHue = (index: number): number => Math.round((index * 137.508) % 360);

export function placeholderSvg(index: number, shot = 0): string {
  const hue = (placeholderHue(index) + shot * 24) % 360;
  const top = hslToHex(hue, 32, 90);
  const bottom = hslToHex(hue, 38, 74);
  const glass = hslToHex(hue, 42, 36);
  const glassLight = hslToHex(hue, 50, 52);
  const cap = hslToHex((hue + 20) % 360, 25, 22);
  // A tall bottle for shot 0, a wider one for the other shots.
  const wide = shot % 2 === 1;
  const bodyWidth = wide ? 760 : 560;
  const bodyX = (SIZE - bodyWidth) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${glass}"/><stop offset="0.35" stop-color="${glassLight}"/><stop offset="1" stop-color="${glass}"/></linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <ellipse cx="${SIZE / 2}" cy="1290" rx="${bodyWidth * 0.62}" ry="46" fill="#000" opacity="0.12"/>
  <rect x="${bodyX}" y="560" width="${bodyWidth}" height="730" rx="64" fill="url(#glass)"/>
  <rect x="${SIZE / 2 - 90}" y="430" width="180" height="150" rx="14" fill="${glass}"/>
  <rect x="${SIZE / 2 - 130}" y="270" width="260" height="170" rx="22" fill="${cap}"/>
  <rect x="${bodyX + 70}" y="640" width="46" height="520" rx="23" fill="#fff" opacity="0.28"/>
</svg>`;
}

/** A PNG placeholder, 1600 x 1600, as the bytes an uploader would send. */
export function placeholderImage(index: number, shot = 0): Promise<Buffer> {
  return sharp(Buffer.from(placeholderSvg(index, shot)))
    .png()
    .toBuffer();
}
