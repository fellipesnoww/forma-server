import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { env } from '../../../config/env.js';
import { errorResponseSchema, idParamsSchema } from '../admin.schemas.js';
import {
  adminExerciseListResponseSchema,
  adminExerciseResponseSchema,
  createAdminExerciseBodySchema,
  createMuscleGroupBodySchema,
  listAdminExercisesQuerySchema,
  muscleGroupListResponseSchema,
  muscleGroupResponseSchema,
  updateAdminExerciseBodySchema,
  updateExerciseStatusBodySchema,
  updateMuscleGroupBodySchema,
} from './admin-exercises.schemas.js';
import {
  addAdminExercise,
  addMuscleGroup,
  editAdminExercise,
  editMuscleGroup,
  getAdminExercises,
  getMuscleGroups,
  setAdminExerciseStatus,
} from './admin-exercises.service.js';

const MEDIA_NOTE =
  `Midia opcional em base64 (MIME por magic number, limite ${String(env.MEDIA_MAX_SIZE_MB)} MB), ` +
  'gravada como midia global legivel por qualquer usuario autenticado.';

/** Catalogo de exercicios e grupos musculares (Fase 3.2). Guard `admin` vem do escopo pai. */
export const adminExercisesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/exercises',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Lista o catalogo de exercicios (inclui inativos)',
        security: [{ bearerAuth: [] }],
        querystring: listAdminExercisesQuerySchema,
        response: {
          200: adminExerciseListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => reply.status(200).send(await getAdminExercises(request.query)),
  );

  app.post(
    '/exercises',
    {
      bodyLimit: env.MEDIA_BODY_LIMIT,
      schema: {
        tags: ['Admin'],
        summary: 'Cria exercicio no catalogo (com midia opcional)',
        description: `Nome unico sem diferenciar maiusculas -> 409. ${MEDIA_NOTE}`,
        security: [{ bearerAuth: [] }],
        body: createAdminExerciseBodySchema,
        response: {
          201: adminExerciseResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          409: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await addAdminExercise(request.user.sub, request.body)),
  );

  app.patch(
    '/exercises/:id',
    {
      bodyLimit: env.MEDIA_BODY_LIMIT,
      schema: {
        tags: ['Admin'],
        summary: 'Edita nome, grupo muscular e/ou midia do exercicio',
        description: MEDIA_NOTE,
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        body: updateAdminExerciseBodySchema,
        response: {
          200: adminExerciseResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(await editAdminExercise(request.user.sub, request.params.id, request.body)),
  );

  app.patch(
    '/exercises/:id/status',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Ativa/desativa exercicio do catalogo',
        description:
          'Inativo some de GET /exercises e nao pode ser adicionado a planilhas/sessoes; ' +
          'registros existentes continuam validos.',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        body: updateExerciseStatusBodySchema,
        response: {
          200: adminExerciseResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(
          await setAdminExerciseStatus(request.user.sub, request.params.id, request.body.isActive),
        ),
  );

  app.get(
    '/muscle-groups',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Lista grupos musculares com contagem de exercicios',
        description: 'Sem paginacao: catalogo pequeno, usado em selects do painel.',
        security: [{ bearerAuth: [] }],
        response: {
          200: muscleGroupListResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (_request, reply) => reply.status(200).send({ items: await getMuscleGroups() }),
  );

  app.post(
    '/muscle-groups',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Cria grupo muscular',
        description: 'Nome (sem diferenciar maiusculas) e slug unicos -> 409.',
        security: [{ bearerAuth: [] }],
        body: createMuscleGroupBodySchema,
        response: {
          201: muscleGroupResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await addMuscleGroup(request.user.sub, request.body)),
  );

  app.patch(
    '/muscle-groups/:id',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Edita nome e/ou slug do grupo muscular',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        body: updateMuscleGroupBodySchema,
        response: {
          200: muscleGroupResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(await editMuscleGroup(request.user.sub, request.params.id, request.body)),
  );
};
