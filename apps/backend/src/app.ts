import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { AppConfig } from './config/env.js';
import type { ReadinessCheck } from './lib/readiness.js';
import { resolveRequestId } from './lib/request-id.js';
import { healthRoutes } from './modules/health/routes.js';
import { noProducts, sampleProductSource } from './modules/seo/pages.js';
import { registerSeo } from './modules/seo/routes.js';
import { loadTemplate } from './modules/seo/shell.js';
import type { ProductSource } from './modules/seo/types.js';
import { notFoundProblem, registerErrorHandling } from './plugins/errors.js';
import { registerSecurity } from './plugins/security.js';

export interface BuildAppOptions {
  config: AppConfig;
  /** Defaults to the sample product outside production and to "no products" in production. */
  products?: ProductSource;
  /** Tests pass `false` to silence logs. */
  logger?: FastifyServerOptions['logger'];
}

/** Keeps secrets and personal data out of logs even if a future change logs a whole object. */
function loggerFor(config: AppConfig): FastifyServerOptions['logger'] {
  if (config.appEnv === 'test' || config.logLevel === 'silent') return false;
  return {
    level: config.logLevel,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        '*.password',
        '*.token',
        '*.phone',
        '*.address',
      ],
      censor: '[redacted]',
    },
  };
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;

  const app = Fastify({
    logger: options.logger ?? loggerFor(config),
    trustProxy: config.trustProxy,
    // Only our own id generator is trusted, never the default `request-id` header.
    requestIdHeader: false,
    genReqId: (request) => resolveRequestId(request.headers['x-request-id']),
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerErrorHandling(app);
  await registerSecurity(app, config);

  const template = await loadTemplate(config.frontendDistDir);
  const readiness: ReadinessCheck[] = [];

  if (template !== null) {
    readiness.push({ name: 'frontend', check: () => true });
    await app.register(healthRoutes, { config, readiness });
    await registerSeo(app, {
      config,
      template,
      products: options.products ?? (config.allowSampleData ? sampleProductSource : noProducts),
    });
  } else {
    // A store must never go live without its frontend; development may run API-only because
    // the Vite dev server serves the pages.
    if (config.appEnv === 'production' || config.appEnv === 'staging') {
      throw new Error(
        `No frontend build found in ${config.frontendDistDir}. Run "pnpm build" before starting.`,
      );
    }
    app.log.warn(`No frontend build in ${config.frontendDistDir}: running API-only.`);
    await app.register(healthRoutes, { config, readiness });
    app.setNotFoundHandler(notFoundProblem);
  }

  return app;
}
