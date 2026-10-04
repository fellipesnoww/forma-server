import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { env } from '../../config/env.js';
import { STRICT_RATE_LIMIT } from '../../plugins/rate-limit.js';
import {
  addActivity,
  addActivityType,
  editActivity,
  getActivities,
  getActivity,
  listActivityTypes,
  removeActivity,
  uploadActivityPhoto,
} from './activities.service.js';
import {
  activityIdParamsSchema,
  activityListResponseSchema,
  activityPhotoResponseSchema,
  activityResponseSchema,
  activityTypeListResponseSchema,
  activityTypeResponseSchema,
  createActivityBodySchema,
  createActivityTypeBodySchema,
  errorResponseSchema,
  listActivitiesQuerySchema,
  updateActivityBodySchema,
  uploadActivityPhotoBodySchema,
} from './activities.schemas.js';

export const activityTypesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Atividades'],
        summary: 'Tipos de atividade padrao + personalizados do usuario',
        description: 'Padrao primeiro, depois personalizados; alfabetico dentro de cada grupo.',
        security: [{ bearerAuth: [] }],
        response: { 200: activityTypeListResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const items = await listActivityTypes(request.user.sub);

      return reply.status(200).send({ items });
    },
  );

  app.post(
    '/custom',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Atividades'],
        summary: 'Cria tipo de atividade personalizado',
        description:
          'Nome unico (sem diferenciar maiusculas) entre os tipos visiveis ao usuario; repetido -> 409.',
        security: [{ bearerAuth: [] }],
        body: createActivityTypeBodySchema,
        response: {
          201: activityTypeResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const type = await addActivityType(request.user.sub, request.body);

      return reply.status(201).send(type);
    },
  );
};

export const activitiesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Atividades'],
        summary: 'Historico paginado de atividades livres',
        description: 'Ordenado por performedAt desc. Filtros from/to aplicam-se a performedAt.',
        security: [{ bearerAuth: [] }],
        querystring: listActivitiesQuerySchema,
        response: {
          200: activityListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await getActivities(request.user.sub, request.query);

      return reply.status(200).send(result);
    },
  );

  app.post(
    '',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Atividades'],
        summary: 'Registra atividade livre',
        security: [{ bearerAuth: [] }],
        body: createActivityBodySchema,
        response: {
          201: activityResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const activity = await addActivity(request.user.sub, request.body);

      return reply.status(201).send(activity);
    },
  );

  app.get(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Atividades'],
        summary: 'Detalhe da atividade',
        security: [{ bearerAuth: [] }],
        params: activityIdParamsSchema,
        response: {
          200: activityResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const activity = await getActivity(request.user.sub, request.params.id);

      return reply.status(200).send(activity);
    },
  );

  app.patch(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Atividades'],
        summary: 'Atualiza tipo, data, duracao, comentario e/ou remove a foto',
        security: [{ bearerAuth: [] }],
        params: activityIdParamsSchema,
        body: updateActivityBodySchema,
        response: {
          200: activityResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const activity = await editActivity(request.user.sub, request.params.id, request.body);

      return reply.status(200).send(activity);
    },
  );

  app.delete(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Atividades'],
        summary: 'Remove a atividade',
        security: [{ bearerAuth: [] }],
        params: activityIdParamsSchema,
        response: {
          204: z.void(),
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await removeActivity(request.user.sub, request.params.id);

      return reply.status(204).send();
    },
  );

  app.post(
    '/:id/photo',
    {
      onRequest: [app.authenticate],
      bodyLimit: env.MEDIA_BODY_LIMIT,
      config: { rateLimit: STRICT_RATE_LIMIT },
      schema: {
        tags: ['Atividades'],
        summary: 'Envia a foto da atividade em base64',
        description:
          'Mesma validacao de midia da foto de sessao (MIME por magic number, limite ' +
          `${String(env.MEDIA_MAX_SIZE_MB)} MB). Sem compressao — ver pendencias em sdd/2.1-atividades-livres.md.`,
        security: [{ bearerAuth: [] }],
        params: activityIdParamsSchema,
        body: uploadActivityPhotoBodySchema,
        response: {
          200: activityPhotoResponseSchema,
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
      const photoUrl = await uploadActivityPhoto(request.user.sub, request.params.id, request.body);

      return reply.status(200).send({ photoUrl });
    },
  );
};
