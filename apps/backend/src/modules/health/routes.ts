import { healthResponseSchema } from '@scentiq/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { AppConfig } from '../../config/env.js';
import { createProblem } from '../../lib/problem.js';
import type { ReadinessCheck } from '../../lib/readiness.js';
import { sendProblem } from '../../plugins/errors.js';
import { APP_VERSION } from '../../version.js';

export interface HealthOptions {
  config: AppConfig;
  readiness: ReadinessCheck[];
}

export async function healthRoutes(app: FastifyInstance, options: HealthOptions): Promise<void> {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  const { config, readiness } = options;

  // Detailed status for the frontend and for monitoring. `env` is hidden in production.
  typed.get(
    '/api/v1/health',
    { schema: { response: { 200: healthResponseSchema } } },
    async (_request, reply) => {
      reply.header('cache-control', 'no-store');
      return {
        status: 'ok' as const,
        version: APP_VERSION,
        time: new Date().toISOString(),
        ...(config.isProduction ? {} : { env: config.appEnv }),
      };
    },
  );

  // Liveness: the process is up. Never touches dependencies.
  app.get('/healthz', async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return { status: 'ok' };
  });

  // Readiness: every registered dependency answers (the frontend build and, when configured, the
  // database). A failing check answers 503 without saying which one, to outsiders.
  app.get('/readyz', async (request, reply) => {
    reply.header('cache-control', 'no-store');
    const results = await Promise.all(
      readiness.map(async ({ name, check }) => {
        try {
          return { name, ok: await check() };
        } catch {
          return { name, ok: false };
        }
      }),
    );
    const failed = results.filter((result) => !result.ok).map((result) => result.name);
    if (failed.length > 0) {
      request.log.warn({ failed }, 'readiness check failed');
      return sendProblem(reply, createProblem({ status: 503, requestId: request.id }));
    }
    return { status: 'ok', checks: Object.fromEntries(results.map((r) => [r.name, 'ok'])) };
  });
}
