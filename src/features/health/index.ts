import type { FastifyInstance } from 'fastify';

import { healthRoutes } from './health.routes.js';

/**
 * Export publico da feature. `app.ts` so conhece esta funcao — nunca importa
 * `health.routes.ts` ou `health.schemas.ts` diretamente.
 */
export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  await app.register(healthRoutes, { prefix: '/health' });
}
