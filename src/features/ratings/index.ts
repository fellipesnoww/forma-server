import type { FastifyInstance } from 'fastify';

import { ratingsRoutes } from './ratings.routes.js';

export { RATING_PLATFORMS } from './ratings.schemas.js';

/** Escrita do usuario; a leitura vive em `features/admin/ratings/` (escopo admin). */
export async function registerRatingsRoutes(app: FastifyInstance): Promise<void> {
  await app.register(ratingsRoutes, { prefix: '/ratings' });
}
