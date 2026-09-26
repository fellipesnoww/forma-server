import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { STRICT_RATE_LIMIT } from '../../plugins/rate-limit.js';
import {
  appleAuthBodySchema,
  authResponseSchema,
  errorResponseSchema,
  googleAuthBodySchema,
  loginBodySchema,
  meResponseSchema,
  refreshBodySchema,
  refreshResponseSchema,
  registerBodySchema,
} from './auth.schemas.js';
import {
  getMe,
  loginOrLinkOAuth,
  loginWithPassword,
  logout,
  refreshSession,
  registerWithPassword,
} from './auth.service.js';

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '',
    {
      config: { rateLimit: STRICT_RATE_LIMIT },
      schema: {
        tags: ['Auth'],
        summary: 'Cria conta com email e senha',
        description: 'Cria o usuario e o perfil minimo associado. Rejeita email ja cadastrado.',
        body: registerBodySchema,
        response: {
          201: authResponseSchema,
          400: errorResponseSchema,
          409: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await registerWithPassword(request.body);

      return reply.status(201).send(result);
    },
  );

  app.post(
    '/login',
    {
      config: { rateLimit: STRICT_RATE_LIMIT },
      schema: {
        tags: ['Auth'],
        summary: 'Autentica com email e senha',
        body: loginBodySchema,
        response: {
          200: authResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await loginWithPassword(request.body);

      return reply.status(200).send(result);
    },
  );

  app.post(
    '/google',
    {
      config: { rateLimit: STRICT_RATE_LIMIT },
      schema: {
        tags: ['Auth'],
        summary: 'Autentica com Google (id_token)',
        description:
          'Verifica o id_token do Google. Se o email coincidir com uma conta existente, ' +
          'vincula a conta em vez de criar uma nova.',
        body: googleAuthBodySchema,
        response: {
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          429: errorResponseSchema,
          200: authResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await loginOrLinkOAuth('google', request.body.idToken);

      return reply.status(200).send(result);
    },
  );

  app.post(
    '/apple',
    {
      config: { rateLimit: STRICT_RATE_LIMIT },
      schema: {
        tags: ['Auth'],
        summary: 'Autentica com Apple (identity_token)',
        description:
          'Verifica o identity_token da Apple. Se o email coincidir com uma conta existente, ' +
          'vincula a conta em vez de criar uma nova.',
        body: appleAuthBodySchema,
        response: {
          200: authResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await loginOrLinkOAuth('apple', request.body.identityToken);

      return reply.status(200).send(result);
    },
  );

  app.post(
    '/refresh',
    {
      config: { rateLimit: STRICT_RATE_LIMIT },
      schema: {
        tags: ['Auth'],
        summary: 'Renova o access token',
        body: refreshBodySchema,
        response: {
          200: refreshResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await refreshSession(request.body.refreshToken);

      return reply.status(200).send(result);
    },
  );

  app.post(
    '/logout',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Invalida os refresh tokens emitidos para o usuario',
        security: [{ bearerAuth: [] }],
        response: {
          204: z.void(),
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await logout(request.user.sub);

      return reply.status(204).send();
    },
  );

  app.get(
    '/me',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Usuario autenticado e perfil resumido',
        security: [{ bearerAuth: [] }],
        response: {
          200: meResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await getMe(request.user.sub);

      return reply.status(200).send(result);
    },
  );
};
