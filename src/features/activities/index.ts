import type { FastifyInstance } from 'fastify';

import { activitiesRoutes, activityTypesRoutes } from './activities.routes.js';

export { activityResponseSchema } from './activities.schemas.js';
export { getActivitiesBetween } from './activities.service.js';

/**
 * Uma feature, dois prefixos: tipos (`/activity-types`) existem so para alimentar as
 * atividades (`/activities`) e compartilham repository/service com elas.
 */
export async function registerActivitiesRoutes(app: FastifyInstance): Promise<void> {
  await app.register(activityTypesRoutes, { prefix: '/activity-types' });
  await app.register(activitiesRoutes, { prefix: '/activities' });
}
