// Security and traceability headers (ADR-0003, security-best-practices pass in Phase 1):
//  - helmet with a strict CSP: this site serves its own scripts, styles, fonts and images only;
//  - HSTS only in production (browsers ignore it over plain http, and staging may be reset);
//  - noindex for every environment that is not production, on every response;
//  - X-Request-Id on every response so a user report can be matched to a log line.
import helmet from '@fastify/helmet';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';

export async function registerSecurity(app: FastifyInstance, config: AppConfig): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
      },
    },
    strictTransportSecurity: config.isProduction
      ? { maxAge: 15552000, includeSubDomains: true }
      : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (!config.allowIndexing) {
      reply.header('x-robots-tag', 'noindex, nofollow');
    }
  });
}
