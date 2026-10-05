import type { FastifyInstance } from 'fastify';

import { dietsRoutes } from './diets.routes.js';

export { dietSummarySchema, type DietSummary } from './diets.schemas.js';
export { getActiveDietSummary } from './diets.service.js';

export async function registerDietsRoutes(app: FastifyInstance): Promise<void> {
  await app.register(dietsRoutes, { prefix: '/diets' });
}
