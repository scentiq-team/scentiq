import { describe, expect, it } from 'vitest';
import indexCss from './index.css?raw';
import tokensCss from './tokens.css?raw';

/** Reads `--c-name: #rrggbb;` pairs from the :root block of tokens.css. */
function readColors(css: string): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const match of css.matchAll(/--c-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    colors[match[1] as string] = match[2] as string;
  }
  return colors;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (
    0.2126 * (channels[0] as number) +
    0.7152 * (channels[1] as number) +
    0.0722 * (channels[2] as number)
  );
}

/** WCAG 2.x contrast ratio between two colours. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light as number) + 0.05) / ((dark as number) + 0.05);
}

const colors = readColors(tokensCss);
const SURFACES = ['bg', 'surface', 'surface-2'] as const;

function color(name: string): string {
  const value = colors[name];
  if (value === undefined) throw new Error(`Missing token --c-${name}`);
  return value;
}

describe('design tokens (direction A)', () => {
  it('define every colour the theme maps', () => {
    for (const name of [
      'bg',
      'surface',
      'surface-2',
      'border',
      'control-border',
      'text',
      'muted',
      'accent',
      'on-accent',
      'signal',
      'focus',
      'danger',
      'success',
    ]) {
      expect(colors[name], name).toBeDefined();
    }
  });

  it('keep body text at 4.5:1 or better on every surface (WCAG 1.4.3)', () => {
    for (const surface of SURFACES) {
      expect(contrast(color('text'), color(surface)), `text on ${surface}`).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(
        contrast(color('muted'), color(surface)),
        `muted on ${surface}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keep coloured text readable on every surface', () => {
    for (const surface of SURFACES) {
      for (const name of ['accent', 'signal', 'danger', 'success']) {
        expect(
          contrast(color(name), color(surface)),
          `${name} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keep the label on a gold button readable', () => {
    expect(contrast(color('on-accent'), color('accent'))).toBeGreaterThanOrEqual(4.5);
  });

  it('make controls and focus rings visible at 3:1 (WCAG 1.4.11)', () => {
    for (const surface of SURFACES) {
      expect(
        contrast(color('control-border'), color(surface)),
        `control-border on ${surface}`,
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrast(color('focus'), color(surface)),
        `focus on ${surface}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps the decorative border below the control border so it is never mistaken for one', () => {
    expect(contrast(color('border'), color('bg'))).toBeLessThan(
      contrast(color('control-border'), color('bg')),
    );
  });
});

describe('text on the hero glow', () => {
  // axe cannot judge text that sits on a gradient (it reports it as "incomplete"), so the
  // brightest point of the glow is checked here instead.
  const glow = indexCss.match(/\.hero-glow\s*\{[^}]*?rgb\((\d+) (\d+) (\d+) \/ ([0-9.]+)\)/);

  it('is found in index.css', () => {
    expect(glow).not.toBeNull();
  });

  it('keeps text, muted text and the accent at 4.5:1 on its brightest point', () => {
    const [, r, g, b, alpha] = glow as RegExpMatchArray;
    const base = color('surface');
    const mix = [1, 3, 5].map((start, index) => {
      const channel = Number.parseInt(base.slice(start, start + 2), 16);
      const glowChannel = Number([r, g, b][index]);
      return Math.round(channel * (1 - Number(alpha)) + glowChannel * Number(alpha));
    });
    const brightest = `#${mix.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    for (const name of ['text', 'muted', 'accent']) {
      expect(contrast(color(name), brightest), `${name} on the glow`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
