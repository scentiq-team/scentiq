import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HEAD_MARKER, ROOT_MARKER } from './html.js';

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateError';
  }
}

/**
 * Reads the built frontend index.html. Returns null when the frontend has not been built.
 * Throws when the file exists but lacks the markers the SEO shell fills in, because serving
 * it would silently ship pages without metadata.
 */
export async function loadTemplate(distDir: string): Promise<string | null> {
  let html: string;
  try {
    html = await readFile(join(distDir, 'index.html'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  for (const marker of [HEAD_MARKER, ROOT_MARKER]) {
    if (!html.includes(marker)) {
      throw new TemplateError(
        `index.html in ${distDir} is missing ${marker}. Rebuild the frontend (pnpm build).`,
      );
    }
  }
  return html;
}
