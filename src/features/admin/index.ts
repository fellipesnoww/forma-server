import type { FastifyInstance } from 'fastify';

import { adminAchievementsRoutes } from './achievements/admin-achievements.routes.js';
import { auditRoutes } from './audit/audit.routes.js';
import { adminChallengesRoutes } from './challenges/admin-challenges.routes.js';
import { adminExerciseReportsRoutes } from './exercise-reports/admin-exercise-reports.routes.js';
import { adminRatingsRoutes } from './ratings/admin-ratings.routes.js';
import { adminExercisesRoutes } from './exercises/admin-exercises.routes.js';
import { adminUsersRoutes, superUserRoutes } from './users/admin-users.routes.js';

/**
 * Namespace `/admin` (Fase 3). Os guards ficam em hooks do escopo encapsulado, nao em cada
 * rota: uma rota admin nova herda `authenticate` + `requireRole('admin')` so por ser
 * registrada aqui, entao esquecer o guard nao e possivel. Rotas exclusivas de super_user
 * ficam num escopo filho que soma `requireRole('super_user')` — hooks do pai rodam antes.
 */
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  await app.register(
    async (admin) => {
      admin.addHook('onRequest', admin.authenticate);
      admin.addHook('onRequest', admin.requireRole('admin'));

      await admin.register(adminExercisesRoutes);
      await admin.register(adminUsersRoutes);
      await admin.register(adminAchievementsRoutes);
      await admin.register(adminChallengesRoutes);
      await admin.register(adminRatingsRoutes);
      await admin.register(adminExerciseReportsRoutes);

      await admin.register(async (superUser) => {
        superUser.addHook('onRequest', superUser.requireRole('super_user'));

        await superUser.register(superUserRoutes);
        await superUser.register(auditRoutes);
      });
    },
    { prefix: '/admin' },
  );
}
