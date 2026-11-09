import { isAbsolute, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EnvError, loadEnv } from './env.js';

// Not a real credential: the password only has to look like a production one.
const APP_DB = 'postgres://scentiq_app:Pq7-r3al-looking@db.internal:5432/scentiq';
const OWNER_DB = 'postgres://scentiq_owner:Zk2-r3al-looking@db.internal:5432/scentiq';

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
    expect(config.mediaLocalDir).toBe(resolve('/work/apps/backend', '.data/media'));
  });

  it('MEDIA_LOCAL_DIR can move the image folder; a blank value means the default', () => {
    expect(loadEnv({ MEDIA_LOCAL_DIR: '../images' }, '/work/apps/backend').mediaLocalDir).toBe(
      resolve('/work/apps/backend', '../images'),
    );
    expect(loadEnv({ MEDIA_LOCAL_DIR: ' ' }, '/work/apps/backend').mediaLocalDir).toBe(
      resolve('/work/apps/backend', '.data/media'),
    );
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
    const production = loadEnv({
      APP_ENV: 'production',
      SITE_ORIGIN: 'https://scentiq.example',
      DATABASE_URL: APP_DB,
    });
    expect(production).toMatchObject({
      isProduction: true,
      allowIndexing: true,
      allowSampleData: false,
    });

    const staging = loadEnv({
      APP_ENV: 'staging',
      SITE_ORIGIN: 'https://staging.scentiq.example',
      DATABASE_URL: APP_DB,
    });
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
      DATABASE_URL: APP_DB,
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
  describe('database variables', () => {
    it('are optional in development and test, so the app can run without a database', () => {
      for (const APP_ENV of ['development', 'test']) {
        const config = loadEnv({ APP_ENV });
        expect(config.databaseUrl).toBeUndefined();
        expect(config.migrationDatabaseUrl).toBeUndefined();
        expect(config.databasePoolMax).toBe(10);
      }
    });

    it('reads the application URL, the owner URL and the pool size', () => {
      const config = loadEnv({
        DATABASE_URL: APP_DB,
        MIGRATION_DATABASE_URL: OWNER_DB,
        DATABASE_POOL_MAX: '20',
      });
      expect(config).toMatchObject({
        databaseUrl: APP_DB,
        migrationDatabaseUrl: OWNER_DB,
        databasePoolMax: 20,
      });
    });

    it('requires DATABASE_URL in staging and production', () => {
      for (const APP_ENV of ['staging', 'production']) {
        expect(() => loadEnv({ APP_ENV, SITE_ORIGIN: 'https://scentiq.example' })).toThrow(
          /DATABASE_URL: is required/,
        );
      }
    });

    it('accepts only postgres URLs and never echoes them', () => {
      expect(() => loadEnv({ DATABASE_URL: 'mysql://u:hunter2@h/db' })).toThrow(/DATABASE_URL/);
      expect(() => loadEnv({ DATABASE_URL: 'not a url hunter2' })).toThrow(/DATABASE_URL/);
      let message = '';
      try {
        loadEnv({ DATABASE_URL: 'mysql://u:hunter2@h/db', DATABASE_POOL_MAX: '0' });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain('DATABASE_POOL_MAX');
      expect(message).not.toContain('hunter2');
    });

    it('reports a malformed URL in production as a normal configuration error, without its text', () => {
      for (const bad of ['not a url with-SECRETpw', 'postgres://u:p%zzSECRETpw@h/db']) {
        let error: unknown;
        try {
          loadEnv({
            APP_ENV: 'production',
            SITE_ORIGIN: 'https://scentiq.example',
            DATABASE_URL: bad,
          });
        } catch (caught) {
          error = caught;
        }
        expect(error, bad).toBeInstanceOf(EnvError);
        expect((error as Error).message).toMatch(/DATABASE_URL/);
        expect((error as Error).message).not.toContain('SECRETpw');
      }
    });

    it('refuses the development password in staging and production', () => {
      const devUrl = 'postgres://scentiq_app:devonly_app@db.internal:5432/scentiq';
      expect(() =>
        loadEnv({
          APP_ENV: 'production',
          SITE_ORIGIN: 'https://scentiq.example',
          DATABASE_URL: devUrl,
        }),
      ).toThrow(/DATABASE_URL: uses a development password/);
      // The same URL is fine on a developer machine.
      expect(loadEnv({ DATABASE_URL: devUrl }).databaseUrl).toBe(devUrl);
    });

    it('refuses to run the app and the migrations as the same role in production', () => {
      expect(() =>
        loadEnv({
          APP_ENV: 'production',
          SITE_ORIGIN: 'https://scentiq.example',
          DATABASE_URL: APP_DB,
          MIGRATION_DATABASE_URL: APP_DB,
        }),
      ).toThrow(/MIGRATION_DATABASE_URL: must use a different database role/);
    });
  });
});
