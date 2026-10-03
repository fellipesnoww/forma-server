import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { env } from '../../config/env.js';
import { STRICT_RATE_LIMIT } from '../../plugins/rate-limit.js';
import {
  addSession,
  completeSession,
  editSession,
  getSessionDetail,
  getSessions,
  uploadSessionPhoto,
} from './workout-sessions.service.js';
import {
  createWorkoutSessionBodySchema,
  errorResponseSchema,
  listWorkoutSessionsQuerySchema,
  sessionDetailResponseSchema,
  sessionIdParamsSchema,
  sessionListResponseSchema,
  sessionPhotoResponseSchema,
  updateWorkoutSessionBodySchema,
  uploadSessionPhotoBodySchema,
} from './workout-sessions.schemas.js';

export const workoutSessionsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Sessoes'],
        summary: 'Historico paginado de sessoes',
        description: 'Ordenado por performedAt desc. Filtros from/to aplicam-se a performedAt.',
        security: [{ bearerAuth: [] }],
        querystring: listWorkoutSessionsQuerySchema,
        response: {
          200: sessionListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await getSessions(request.user.sub, request.query);

      return reply.status(200).send(result);
    },
  );

  app.post(
    '',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Sessoes'],
        summary: 'Registra sessao de treino com exercicios e series',
        security: [{ bearerAuth: [] }],
        body: createWorkoutSessionBodySchema,
        response: {
          201: sessionDetailResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await addSession(request.user.sub, request.body);

      return reply.status(201).send(session);
    },
  );

  app.get(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Sessoes'],
        summary: 'Detalhe da sessao',
        security: [{ bearerAuth: [] }],
        params: sessionIdParamsSchema,
        response: {
          200: sessionDetailResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await getSessionDetail(request.user.sub, request.params.id);

      return reply.status(200).send(session);
    },
  );

  app.patch(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Sessoes'],
        summary: 'Atualiza data, comentario, foto (remocao) e/ou series',
        description: '`exercises`, se enviado, substitui todos os exercicios e series da sessao.',
        security: [{ bearerAuth: [] }],
        params: sessionIdParamsSchema,
        body: updateWorkoutSessionBodySchema,
        response: {
          200: sessionDetailResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await editSession(request.user.sub, request.params.id, request.body);

      return reply.status(200).send(session);
    },
  );

  app.post(
    '/:id/complete',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Sessoes'],
        summary: 'Finaliza a sessao (idempotente)',
        description:
          'Chamar de novo numa sessao ja finalizada devolve 200 com o completedAt original.',
        security: [{ bearerAuth: [] }],
        params: sessionIdParamsSchema,
        response: {
          200: sessionDetailResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await completeSession(request.user.sub, request.params.id);

      return reply.status(200).send(session);
    },
  );

  app.post(
    '/:id/photo',
    {
      onRequest: [app.authenticate],
      bodyLimit: env.MEDIA_BODY_LIMIT,
      config: { rateLimit: STRICT_RATE_LIMIT },
      schema: {
        tags: ['Sessoes'],
        summary: 'Envia a foto pos-treino em base64',
        description:
          'Reaproveita a validacao de midia da Fase 0 (MIME por magic number, limite ' +
          `${String(env.MEDIA_MAX_SIZE_MB)} MB). Sem compressao — ver pendencias em sdd/1.5-sessoes-treino.md.`,
        security: [{ bearerAuth: [] }],
        params: sessionIdParamsSchema,
        body: uploadSessionPhotoBodySchema,
        response: {
          200: sessionPhotoResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const photoUrl = await uploadSessionPhoto(request.user.sub, request.params.id, request.body);

      return reply.status(200).send({ photoUrl });
    },
  );
};
