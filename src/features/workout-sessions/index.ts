import type { FastifyInstance } from 'fastify';

import { workoutSessionsRoutes } from './workout-sessions.routes.js';

export async function registerWorkoutSessionsRoutes(app: FastifyInstance): Promise<void> {
  await app.register(workoutSessionsRoutes, { prefix: '/workout-sessions' });
}
