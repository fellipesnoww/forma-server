import type { FastifyInstance } from 'fastify';

import { workoutSheetsRoutes } from './workout-sheets.routes.js';

export async function registerWorkoutSheetsRoutes(app: FastifyInstance): Promise<void> {
  await app.register(workoutSheetsRoutes, { prefix: '/workout-sheets' });
}
