import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { env } from '../../config/env.js';
import { STRICT_RATE_LIMIT } from '../../plugins/rate-limit.js';
import {
  addMeasurement,
  getMeasurements,
  getProfile,
  patchProfile,
  uploadAvatar,
} from './profile.service.js';
import {
  avatarResponseSchema,
  createMeasurementBodySchema,
  errorResponseSchema,
  listMeasurementsQuerySchema,
  measurementListResponseSchema,
  measurementResponseSchema,
  profileResponseSchema,
  updateProfileBodySchema,
  uploadAvatarBodySchema,
} from './profile.schemas.js';

export const profileRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Perfil'],
        summary: 'Perfil e medidas atuais',
        security: [{ bearerAuth: [] }],
        response: { 200: profileResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const profile = await getProfile(request.user.sub);

      return reply.status(200).send(profile);
    },
  );

  app.patch(
    '',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Perfil'],
        summary: 'Atualiza nome e/ou medidas atuais',
        security: [{ bearerAuth: [] }],
        body: updateProfileBodySchema,
        response: {
          200: profileResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const profile = await patchProfile(request.user.sub, request.body);

      return reply.status(200).send(profile);
    },
  );

  app.post(
    '/avatar',
    {
      onRequest: [app.authenticate],
      bodyLimit: env.MEDIA_BODY_LIMIT,
      config: { rateLimit: STRICT_RATE_LIMIT },
      schema: {
        tags: ['Perfil'],
        summary: 'Envia o avatar em base64',
        description:
          'Reaproveita a validacao de midia da Fase 0 (MIME por magic number, limite ' +
          `${String(env.MEDIA_MAX_SIZE_MB)} MB). Sem resize dedicado — ver pendencias em sdd/1.2-perfil.md.`,
        security: [{ bearerAuth: [] }],
        body: uploadAvatarBodySchema,
        response: {
          200: avatarResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const avatarUrl = await uploadAvatar(request.user.sub, request.body);

      return reply.status(200).send({ avatarUrl });
    },
  );

  app.get(
    '/measurements',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Perfil'],
        summary: 'Historico paginado de medidas',
        security: [{ bearerAuth: [] }],
        querystring: listMeasurementsQuerySchema,
        response: { 200: measurementListResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const result = await getMeasurements(request.user.sub, request.query);

      return reply.status(200).send(result);
    },
  );

  app.post(
    '/measurements',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Perfil'],
        summary: 'Registra novas medidas',
        description: 'Cria um registro no historico e sincroniza os campos atuais do perfil.',
        security: [{ bearerAuth: [] }],
        body: createMeasurementBodySchema,
        response: {
          201: measurementResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const measurement = await addMeasurement(request.user.sub, request.body);

      return reply.status(201).send(measurement);
    },
  );
};
