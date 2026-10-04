import type { FastifyInstance } from 'fastify';

import { workoutSessionsRoutes } from './workout-sessions.routes.js';

export { sessionSummarySchema } from './workout-sessions.schemas.js';
export { getSessionsBetween } from './workout-sessions.service.js';

export async function registerWorkoutSessionsRoutes(app: FastifyInstance): Promise<void> {
  await app.register(workoutSessionsRoutes, { prefix: '/workout-sessions' });
}
