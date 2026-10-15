import { isAbsolute, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EnvError, loadEnv } from './env.js';

describe('loadEnv', () => {
  it('applies safe development defaults', () => {
    const config = loadEnv({}, '/work/apps/backend');
    expect(config).toMatchObject({
      appEnv: 'development',
      host: '127.0.0.1',
      port: 3000,
      logLevel: 'info',
      trustProxy: false,
      siteOrigin: 'http://localhost:3000',
      isProduction: false,
      allowIndexing: false,
      allowSampleData: true,
    });
    expect(config.frontendDistDir).toBe(resolve('/work/apps/backend', '../frontend/dist'));
  });

  it('reads and coerces explicit values', () => {
    const config = loadEnv({
      PORT: '8080',
      HOST: '0.0.0.0',
      LOG_LEVEL: 'debug',
      TRUST_PROXY: 'true',
      APP_ENV: 'test',
    });
    expect(config).toMatchObject({
      port: 8080,
      host: '0.0.0.0',
      logLevel: 'debug',
      trustProxy: true,
      appEnv: 'test',
    });
    expect(isAbsolute(config.frontendDistDir)).toBe(true);
  });

  it('treats blank values as not set', () => {
    const config = loadEnv({ SITE_ORIGIN: '', PORT: '  ', LOG_LEVEL: '' });
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe('info');
    expect(config.siteOrigin).toBe('http://localhost:3000');
  });

  it('allows indexing and forbids sample data only in production', () => {
    const production = loadEnv({ APP_ENV: 'production', SITE_ORIGIN: 'https://scentiq.example' });
    expect(production).toMatchObject({
      isProduction: true,
      allowIndexing: true,
      allowSampleData: false,
    });

    const staging = loadEnv({ APP_ENV: 'staging', SITE_ORIGIN: 'https://staging.scentiq.example' });
    expect(staging).toMatchObject({
      isProduction: false,
      allowIndexing: false,
      allowSampleData: true,
    });
  });

  it('requires an https SITE_ORIGIN in staging and production', () => {
    expect(() => loadEnv({ APP_ENV: 'production' })).toThrow(/SITE_ORIGIN: is required/);
    expect(() => loadEnv({ APP_ENV: 'staging', SITE_ORIGIN: 'http://x.example' })).toThrow(
      /SITE_ORIGIN: must use https/,
    );
  });

  it('normalises SITE_ORIGIN to a bare origin', () => {
    const config = loadEnv({
      APP_ENV: 'production',
      SITE_ORIGIN: 'https://Scentiq.Example/shop/?a=1',
    });
    expect(config.siteOrigin).toBe('https://scentiq.example');
  });

  it('rejects values that are out of range or not allowed', () => {
    expect(() => loadEnv({ PORT: '0' })).toThrow(EnvError);
    expect(() => loadEnv({ PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadEnv({ APP_ENV: 'prod' })).toThrow(/APP_ENV/);
    expect(() => loadEnv({ TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/);
    expect(() => loadEnv({ SITE_ORIGIN: 'ftp://example.com' })).toThrow(/SITE_ORIGIN/);
  });

  it('lists every broken variable by name and never echoes their values', () => {
    let message = '';
    try {
      loadEnv({ PORT: 'hunter2-secret', LOG_LEVEL: 'swordfish-secret' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('PORT');
    expect(message).toContain('LOG_LEVEL');
    expect(message).not.toContain('hunter2-secret');
    expect(message).not.toContain('swordfish-secret');
  });
});
