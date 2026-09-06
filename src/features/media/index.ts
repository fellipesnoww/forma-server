import type { FastifyInstance } from 'fastify';

import { mediaRoutes } from './media.routes.js';

/**
 * Export publico da feature. O servico reutilizavel vive em `shared/media/` — outras
 * features (perfil, sessoes, atividades) consomem `MediaService` de la, nao estas rotas.
 */
export async function registerMediaRoutes(app: FastifyInstance): Promise<void> {
  await app.register(mediaRoutes, { prefix: '/media' });
}
