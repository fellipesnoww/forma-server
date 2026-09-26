import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  addCustomExercise,
  editCustomExercise,
  listExercises,
  removeCustomExercise,
} from './exercises.service.js';
import {
  createCustomExerciseBodySchema,
  errorResponseSchema,
  exerciseIdParamsSchema,
  exerciseListResponseSchema,
  exerciseResponseSchema,
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
