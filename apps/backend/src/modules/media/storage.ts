// Where image bytes live (ADR-0009). One interface, two drivers: local disk (development and tests,
// this file) and S3-compatible storage for Cloudflare R2 (production, added with the deployment
// phase behind the same interface). Keys are random and validated; a key can never reach outside
// the storage root.

import { randomBytes } from 'node:crypto';
import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { STORAGE_KEY_PATTERN } from '../../db/schema/media.js';

export interface MediaStorage {
  /** Stores new bytes. A key is written once: storing over an existing key is an error. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | undefined>;
  /** Removing a key that does not exist is not an error. */
  delete(key: string): Promise<void>;
}

const KEY_REGEX = new RegExp(STORAGE_KEY_PATTERN);

export class InvalidStorageKeyError extends Error {
  constructor() {
    super('Invalid storage key.');
    this.name = 'InvalidStorageKeyError';
  }
}

/** The same format the database enforces on `media_assets.storage_key`. */
export function assertValidStorageKey(key: string): void {
  // A key may not contain a path trick even if it matched the pattern: no empty segments, no dots.
  if (!KEY_REGEX.test(key) || key.includes('//') || key.endsWith('/')) {
    throw new InvalidStorageKeyError();
  }
}

/** A fresh random key prefix such as `m/3fa85f6457174562b3fc2c96`. Never derived from user input. */
export function newStorageKey(): string {
  return `m/${randomBytes(12).toString('hex')}`;
}

export class LocalDiskStorage implements MediaStorage {
  private readonly root: string;

  constructor(rootDirectory: string) {
    this.root = resolve(rootDirectory);
  }

  /** The file for a key, guaranteed to be inside the root. */
  private pathFor(key: string): string {
    assertValidStorageKey(key);
    const path = resolve(this.root, ...key.split('/'));
    if (!path.startsWith(this.root + sep)) throw new InvalidStorageKeyError();
    return path;
  }

  async put(key: string, bytes: Uint8Array, _contentType: string): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    // Write beside the target, then link it into place: a reader never sees half a file, and `link`
    // fails with EEXIST instead of replacing a file, so a (practically impossible) key collision is
    // loud instead of silent.
    const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: 'wx' });
      await link(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async get(key: string): Promise<Uint8Array | undefined> {
    try {
      return await readFile(this.pathFor(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}
