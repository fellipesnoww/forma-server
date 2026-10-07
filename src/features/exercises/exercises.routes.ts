import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  addCustomExercise,
  addExerciseReport,
  editCustomExercise,
  getLastSession,
  listExercises,
  removeCustomExercise,
} from './exercises.service.js';
import {
  createCustomExerciseBodySchema,
  createExerciseReportBodySchema,
  errorResponseSchema,
  exerciseIdParamsSchema,
  exerciseListResponseSchema,
  exerciseReportSchema,
  exerciseResponseSchema,
  lastSessionQuerySchema,
  lastSessionResponseSchema,
  listExercisesQuerySchema,
  updateCustomExerciseBodySchema,
} from './exercises.schemas.js';

export const exercisesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Exercicios'],
        summary: 'Catalogo ativo + exercicios personalizados do usuario',
        security: [{ bearerAuth: [] }],
        querystring: listExercisesQuerySchema,
        response: { 200: exerciseListResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const items = await listExercises(request.user.sub, {
        muscleGroupSlug: request.query.muscleGroup,
        search: request.query.q,
      });

      return reply.status(200).send({ items });
    },
  );

  app.get(
    '/:id/last-session',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Exercicios'],
        summary: 'Series da ultima sessao com o exercicio (sugestao de carga)',
        description:
          'Aceita id do catalogo ou de exercicio personalizado do usuario. Sem historico, lastSession = null.',
        security: [{ bearerAuth: [] }],
        params: exerciseIdParamsSchema,
        querystring: lastSessionQuerySchema,
        response: {
          200: lastSessionResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await getLastSession(request.user.sub, request.params.id, request.query);

      return reply.status(200).send(result);
    },
  );

  app.post(
    '/:id/reports',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Exercicios'],
        summary: 'Reporta um problema nos dados de um exercicio do catalogo',
        description:
          'Qualquer usuario autenticado. So exercicios do catalogo (inclusive desativados); id ' +
          'de exercicio personalizado responde 404. A leitura e exclusiva do painel admin ' +
          '(GET /admin/exercise-reports).',
        security: [{ bearerAuth: [] }],
        params: exerciseIdParamsSchema,
        body: createExerciseReportBodySchema,
        response: {
          201: exerciseReportSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await addExerciseReport(request.user.sub, request.params.id, request.body)),
  );

  app.post(
    '/custom',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Exercicios'],
        summary: 'Cria exercicio personalizado',
        security: [{ bearerAuth: [] }],
        body: createCustomExerciseBodySchema,
        response: {
          201: exerciseResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const exercise = await addCustomExercise(request.user.sub, request.body);

      return reply.status(201).send(exercise);
    },
  );

  app.patch(
    '/custom/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Exercicios'],
        summary: 'Edita exercicio personalizado (somente dono)',
        security: [{ bearerAuth: [] }],
        params: exerciseIdParamsSchema,
        body: updateCustomExerciseBodySchema,
        response: {
          200: exerciseResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const exercise = await editCustomExercise(request.user.sub, request.params.id, request.body);

      return reply.status(200).send(exercise);
    },
  );

  app.delete(
    '/custom/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Exercicios'],
        summary: 'Remove (soft delete) exercicio personalizado (somente dono)',
        security: [{ bearerAuth: [] }],
        params: exerciseIdParamsSchema,
        response: {
          204: z.void(),
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await removeCustomExercise(request.user.sub, request.params.id);

      return reply.status(204).send();
    },
  );
};
