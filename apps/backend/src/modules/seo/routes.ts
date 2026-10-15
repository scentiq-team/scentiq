// Serves the built frontend from the same origin as the API (ADR-0001, ADR-0002):
//  - real files (/assets/*, favicon, og image) get explicit static routes with cache headers;
//  - index.html is never served raw: every other GET/HEAD path gets the SEO shell for its route,
//    with the real HTTP status (404 for unknown pages, so crawlers never see "soft 404s");
//  - anything under /api, and any non-GET method, gets a problem+json 404.
import fastifyStatic from '@fastify/static';
import { BRAND_NAME, matchRoute } from '@scentiq/shared';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../config/env.js';
import { notFoundProblem } from '../../plugins/errors.js';
import { renderHead, renderShell } from './html.js';
import { buildPage } from './pages.js';
import type { ProductSource } from './types.js';

export interface SeoOptions {
  config: AppConfig;
  template: string;
  products: ProductSource;
}

const ONE_YEAR = 'public, max-age=31536000, immutable';
const ONE_DAY = 'public, max-age=86400';

export async function registerSeo(app: FastifyInstance, options: SeoOptions): Promise<void> {
  const { config, template, products } = options;

  await app.register(fastifyStatic, {
    root: config.frontendDistDir,
    prefix: '/',
    index: false,
    wildcard: false,
    globIgnore: ['**/index.html'],
    cacheControl: false,
    decorateReply: false,
    setHeaders(reply, filePath) {
      // Vite fingerprints everything under /assets, so those files can be cached forever.
      const hashed = filePath.replaceAll('\\', '/').includes('/assets/');
      reply.header('cache-control', hashed ? ONE_YEAR : ONE_DAY);
    },
  });

  const context = {
    origin: config.siteOrigin,
    products,
    allowIndexing: config.allowIndexing,
    allowSampleData: config.allowSampleData,
  };

  app.setNotFoundHandler(async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? '/';
    const isApi = pathname === '/api' || pathname.startsWith('/api/');
    const isRead = request.method === 'GET' || request.method === 'HEAD';
    if (isApi || !isRead) return notFoundProblem(request, reply);

    const page = await buildPage(matchRoute(pathname), context);
    const html = renderShell(template, page, renderHead(page, config.siteOrigin, BRAND_NAME));
    return reply
      .status(page.status)
      .type('text/html; charset=utf-8')
      .header('cache-control', 'no-cache')
      .send(html);
  });
}
