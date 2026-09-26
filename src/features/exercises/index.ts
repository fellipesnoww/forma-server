import type { FastifyInstance } from 'fastify';

import { exercisesRoutes } from './exercises.routes.js';

export { exerciseRefExists } from './exercises.service.js';

/**
 * Export publico da feature. `app.ts` e outras features so conhecem o que sai daqui —
 * nunca importam `exercises.repository.ts`/`exercises.service.ts` diretamente.
 */
export async function registerExercisesRoutes(app: FastifyInstance): Promise<void> {
  await app.register(exercisesRoutes, { prefix: '/exercises' });
}
