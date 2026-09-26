import type { FastifyInstance } from 'fastify';

import { profileRoutes } from './profile.routes.js';

/**
 * Export publico da feature. `app.ts` so conhece esta funcao — nunca importa
 * `profile.routes.ts` ou `profile.schemas.ts` diretamente.
 */
export async function registerProfileRoutes(app: FastifyInstance): Promise<void> {
  await app.register(profileRoutes, { prefix: '/profile' });
}
