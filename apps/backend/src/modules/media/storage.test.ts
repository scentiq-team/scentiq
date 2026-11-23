import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertValidStorageKey,
  InvalidStorageKeyError,
  LocalDiskStorage,
  newStorageKey,
} from './storage.js';

let root: string;
let outside: string;
let storage: LocalDiskStorage;

beforeAll(async () => {
  const base = await mkdtemp(join(tmpdir(), 'scentiq-storage-'));
  root = join(base, 'root');
  outside = join(base, 'outside');
  await mkdir(root);
  await mkdir(outside);
  storage = new LocalDiskStorage(root);
});
afterAll(async () => {
  await rm(join(root, '..'), { recursive: true, force: true });
});

const bytes = (text: string) => new TextEncoder().encode(text);
const files = async (directory: string): Promise<string[]> =>
  (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));

describe('keys', () => {
  it('newStorageKey is random, valid and different every time', () => {
    const keys = new Set(Array.from({ length: 50 }, () => newStorageKey()));
    expect(keys.size).toBe(50);
    for (const key of keys) {
      expect(() => assertValidStorageKey(`${key}-480`)).not.toThrow();
      expect(key).toMatch(/^m\/[0-9a-f]{24}$/);
    }
  });

  it.each([
    ['a parent folder', '../outside/x-480'],
    ['a parent folder in the middle', 'm/../../outside/x-480'],
    ['an absolute path', '/etc/passwd'],
    ['a Windows drive', 'c:/windows/x-480'],
    ['a backslash', 'm\\..\\x1234567'],
    ['an empty segment', 'm//abcdef0123'],
    ['a trailing slash', 'm/abcdef0123/'],
    ['capital letters', 'M/ABCDEF0123'],
    ['a dot', 'm/abcdef.jpg1'],
    ['an encoded dot', 'm/%2e%2e/abcdef0'],
    ['a null byte', 'm/abcdef0123\u0000.jpg'],
    ['a space', 'm/abc def 0123'],
    ['too short', 'm/abc'],
    ['too long', `m/${'a'.repeat(130)}`],
    ['empty', ''],
    ['a leading slash segment', '/m/abcdef0123'],
    ['a newline', 'm/abcdef0123\nx'],
  ])('refuses %s', async (_label, key) => {
    expect(() => assertValidStorageKey(key)).toThrow(InvalidStorageKeyError);
    await expect(storage.put(key, bytes('x'), 'image/webp')).rejects.toBeInstanceOf(
      InvalidStorageKeyError,
    );
    await expect(storage.get(key)).rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(storage.delete(key)).rejects.toBeInstanceOf(InvalidStorageKeyError);
  });

  it('nothing was written outside the root by the refused keys', async () => {
    expect(await files(outside)).toEqual([]);
  });
});

describe('LocalDiskStorage', () => {
  it('stores and returns the same bytes', async () => {
    const key = `${newStorageKey()}-480`;
    const data = new Uint8Array([0, 1, 2, 255, 254]);
    await storage.put(key, data, 'image/webp');
    expect(Array.from((await storage.get(key)) ?? [])).toEqual([0, 1, 2, 255, 254]);
  });

  it('a key that does not exist is undefined, not an error', async () => {
    expect(await storage.get(`${newStorageKey()}-960`)).toBeUndefined();
  });

  it('deleting removes the file, and deleting again is fine', async () => {
    const key = `${newStorageKey()}-480`;
    await storage.put(key, bytes('x'), 'image/webp');
    await storage.delete(key);
    expect(await storage.get(key)).toBeUndefined();
    await expect(storage.delete(key)).resolves.toBeUndefined();
  });

  it('never overwrites: a second put on the same key fails and the first bytes stay', async () => {
    const key = `${newStorageKey()}-480`;
    await storage.put(key, bytes('first'), 'image/webp');
    await expect(storage.put(key, bytes('second'), 'image/webp')).rejects.toMatchObject({
      code: 'EEXIST',
    });
    expect(Buffer.from((await storage.get(key)) ?? []).toString()).toBe('first');
  });

  it('leaves no temporary file behind, after a success or a refusal', async () => {
    const key = `${newStorageKey()}-480`;
    await storage.put(key, bytes('one'), 'image/webp');
    await storage.put(key, bytes('two'), 'image/webp').catch(() => undefined);
    const leftovers = (await files(root)).filter((file) => file.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('keeps every file inside its root', async () => {
    const written = await files(root);
    expect(written.length).toBeGreaterThan(0);
    for (const file of written) expect(file.startsWith(root)).toBe(true);
  });

  it('a file planted outside the root is not reachable through a key', async () => {
    await writeFile(join(outside, 'secret.txt'), 'secret');
    await expect(storage.get('../outside/secret.txt')).rejects.toBeInstanceOf(
      InvalidStorageKeyError,
    );
    expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toBe('secret');
  });
});
