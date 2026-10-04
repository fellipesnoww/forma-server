import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { env } from '../../../config/env.js';
import { errorResponseSchema, idParamsSchema, paginationQuerySchema } from '../admin.schemas.js';
import {
  achievementListResponseSchema,
  achievementResponseSchema,
  achievementUnlockListResponseSchema,
  createAchievementBodySchema,
  listAchievementsQuerySchema,
  updateAchievementBodySchema,
} from './admin-achievements.schemas.js';
import {
  addAchievement,
  editAchievement,
  getAchievement,
  getAchievementUnlocks,
  getAchievements,
  removeAchievement,
} from './admin-achievements.service.js';

const CRITERIA_NOTE =
  'criteria: { type: streak_days, days } | { type: workout_count, count } | ' +
  '{ type: challenge_complete, challengeId } (desafio precisa existir -> senao 400).';

/** Cadastro de conquistas (Fase 3.5). Guard `admin` vem do escopo pai. */
export const adminAchievementsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/achievements',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Lista conquistas com contagem de desbloqueios',
        security: [{ bearerAuth: [] }],
        querystring: listAchievementsQuerySchema,
        response: {
          200: achievementListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => reply.status(200).send(await getAchievements(request.query)),
  );

  app.post(
    '/achievements',
    {
      bodyLimit: env.MEDIA_BODY_LIMIT,
      schema: {
        tags: ['Admin'],
        summary: 'Cria conquista (icone opcional em base64)',
        description: `${CRITERIA_NOTE} Nome unico sem diferenciar maiusculas -> 409.`,
        security: [{ bearerAuth: [] }],
        body: createAchievementBodySchema,
        response: {
          201: achievementResponseSchema,
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
      reply.status(201).send(await addAchievement(request.user.sub, request.body)),
  );

  app.get(
    '/achievements/:id',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Detalhe da conquista',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        response: {
          200: achievementResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => reply.status(200).send(await getAchievement(request.params.id)),
  );

  app.patch(
    '/achievements/:id',
    {
      bodyLimit: env.MEDIA_BODY_LIMIT,
      schema: {
        tags: ['Admin'],
        summary: 'Edita conquista (inclui ativar/desativar e trocar icone)',
        description: `${CRITERIA_NOTE} Trocar o criterio nao revoga desbloqueios existentes.`,
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        body: updateAchievementBodySchema,
        response: {
          200: achievementResponseSchema,
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
        .send(await editAchievement(request.user.sub, request.params.id, request.body)),
  );

  app.delete(
    '/achievements/:id',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Exclui conquista que ninguem desbloqueou',
        description: 'Com desbloqueios -> 409 (desative em vez de excluir).',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        response: {
          204: z.void(),
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await removeAchievement(request.user.sub, request.params.id);

      return reply.status(204).send();
    },
  );

  app.get(
    '/achievements/:id/unlocks',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Usuarios que desbloquearam a conquista (paginado)',
        description: 'Ordenado por unlockedAt desc.',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        querystring: paginationQuerySchema,
        response: {
          200: achievementUnlockListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply.status(200).send(await getAchievementUnlocks(request.params.id, request.query)),
  );
};
