import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { errorResponseSchema } from '../admin.schemas.js';
import {
  exerciseReportListResponseSchema,
  listExerciseReportsQuerySchema,
} from './admin-exercise-reports.schemas.js';
import { getExerciseReports } from './admin-exercise-reports.service.js';

/** Reports de exercicios enviados pelos usuarios — escopo `admin` (user recebe 403). */
export const adminExerciseReportsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/exercise-reports',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Lista reports de exercicios enviados pelos usuarios (paginado)',
        description: 'Ordenado por createdAt desc; from/to inclusivos.',
        security: [{ bearerAuth: [] }],
        querystring: listExerciseReportsQuerySchema,
        response: {
          200: exerciseReportListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => reply.status(200).send(await getExerciseReports(request.query)),
  );
};
