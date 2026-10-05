import type { FastifyInstance } from 'fastify';

import { statsRoutes } from './stats.routes.js';

/** Feature somente leitura: numeros agregados da tela inicial (dashboard). */
export async function registerStatsRoutes(app: FastifyInstance): Promise<void> {
  await app.register(statsRoutes, { prefix: '/stats' });
}
