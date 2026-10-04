import type { FastifyInstance } from 'fastify';

import { progressRoutes } from './progress.routes.js';

/** Feature somente leitura: series temporais de carga (sessoes 1.5) e medidas (1.2). */
export async function registerProgressRoutes(app: FastifyInstance): Promise<void> {
  await app.register(progressRoutes, { prefix: '/progress' });
}
