import type { FastifyInstance } from 'fastify';

import { authRoutes } from './auth.routes.js';

/**
 * Export publico da feature. `app.ts` so conhece esta funcao — nunca importa
 * `auth.routes.ts` ou `auth.schemas.ts` diretamente.
 */
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes, { prefix: '/auth' });
}
