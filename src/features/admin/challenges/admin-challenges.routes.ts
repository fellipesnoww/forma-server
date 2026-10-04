import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { errorResponseSchema, idParamsSchema } from '../admin.schemas.js';
import {
  challengeListResponseSchema,
  challengeResponseSchema,
  createChallengeBodySchema,
  listChallengesQuerySchema,
  updateChallengeBodySchema,
} from './admin-challenges.schemas.js';
import {
  addChallenge,
  editChallenge,
  getChallenge,
  getChallenges,
  removeChallenge,
} from './admin-challenges.service.js';

const GOAL_NOTE =
  'goal: { type: workout_count, count } | { type: activity_count, count, activityTypeId? } | ' +
  '{ type: activity_minutes, minutes, activityTypeId? } — activityTypeId so de tipo padrao.';

/** Cadastro de desafios (Fase 3.5). Guard `admin` vem do escopo pai. */
export const adminChallengesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/challenges',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Lista desafios com contagem de participantes',
        description: 'Ordenado por startsAt desc. Filtros q, status (isActive) e period.',
        security: [{ bearerAuth: [] }],
        querystring: listChallengesQuerySchema,
        response: {
          200: challengeListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => reply.status(200).send(await getChallenges(request.query)),
  );

  app.post(
    '/challenges',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Cria desafio',
        description: `${GOAL_NOTE} endsAt (exclusivo) precisa ser depois de startsAt.`,
        security: [{ bearerAuth: [] }],
        body: createChallengeBodySchema,
        response: {
          201: challengeResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await addChallenge(request.user.sub, request.body)),
  );

  app.get(
    '/challenges/:id',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Detalhe do desafio',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        response: {
          200: challengeResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => reply.status(200).send(await getChallenge(request.params.id)),
  );

  app.patch(
    '/challenges/:id',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Edita desafio (inclui ativar/desativar)',
        description: `${GOAL_NOTE} Meta congelada apos o primeiro participante -> 409.`,
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        body: updateChallengeBodySchema,
        response: {
          200: challengeResponseSchema,
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
        .send(await editChallenge(request.user.sub, request.params.id, request.body)),
  );

  app.delete(
    '/challenges/:id',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Exclui desafio sem participantes',
        description:
          'Com participantes ou referenciado por conquista challenge_complete -> 409 (desative).',
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
      await removeChallenge(request.user.sub, request.params.id);

      return reply.status(204).send();
    },
  );
};
