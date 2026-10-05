import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { STRICT_RATE_LIMIT } from '../../plugins/rate-limit.js';
import {
  addDiet,
  changeDietActivation,
  editDiet,
  estimateCalories,
  getDiet,
  getDiets,
  removeDiet,
} from './diets.service.js';
import {
  calorieEstimateBodySchema,
  calorieEstimateResponseSchema,
  createDietBodySchema,
  dietDetailSchema,
  dietIdParamsSchema,
  dietListResponseSchema,
  errorResponseSchema,
  updateDietBodySchema,
} from './diets.schemas.js';

const TAG = 'Dietas';

export const dietsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: [TAG],
        summary: 'Lista dietas do usuario com total calorico e indicador de ativa',
        security: [{ bearerAuth: [] }],
        response: { 200: dietListResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => reply.status(200).send({ items: await getDiets(request.user.sub) }),
  );

  app.post(
    '',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: [TAG],
        summary: 'Cria dieta com refeicoes e alimentos',
        description: 'Nasce inativa; use POST /diets/:id/activate.',
        security: [{ bearerAuth: [] }],
        body: createDietBodySchema,
        response: { 201: dietDetailSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => reply.status(201).send(await addDiet(request.user.sub, request.body)),
  );

  app.post(
    '/calorie-estimate',
    {
      onRequest: [app.authenticate],
      config: { rateLimit: STRICT_RATE_LIMIT },
      schema: {
        tags: [TAG],
        summary: 'Estima as calorias de um alimento com IA (botao "IA")',
        description:
          'Nao grava nada: devolve a sugestao para o usuario revisar. 503 quando nenhum ' +
          'provedor de IA esta configurado ou o provedor falhou.',
        security: [{ bearerAuth: [] }],
        body: calorieEstimateBodySchema,
        response: {
          200: calorieEstimateResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          429: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply.status(200).send(await estimateCalories(request.body, request.log)),
  );

  app.get(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: [TAG],
        summary: 'Detalhe da dieta com refeicoes, alimentos e totais',
        security: [{ bearerAuth: [] }],
        params: dietIdParamsSchema,
        response: { 200: dietDetailSchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) =>
      reply.status(200).send(await getDiet(request.user.sub, request.params.id)),
  );

  app.patch(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: [TAG],
        summary: 'Atualiza nome/objetivo e/ou substitui refeicoes e alimentos',
        security: [{ bearerAuth: [] }],
        params: dietIdParamsSchema,
        body: updateDietBodySchema,
        response: {
          200: dietDetailSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply.status(200).send(await editDiet(request.user.sub, request.params.id, request.body)),
  );

  app.delete(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: [TAG],
        summary: 'Remove a dieta (definitivo)',
        security: [{ bearerAuth: [] }],
        params: dietIdParamsSchema,
        response: { 204: z.void(), 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      await removeDiet(request.user.sub, request.params.id);

      return reply.status(204).send();
    },
  );

  app.post(
    '/:id/activate',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: [TAG],
        summary: 'Torna a dieta a ativa (desativa a anterior)',
        security: [{ bearerAuth: [] }],
        params: dietIdParamsSchema,
        response: { 200: dietDetailSchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) =>
      reply.status(200).send(await changeDietActivation(request.user.sub, request.params.id, true)),
  );

  app.post(
    '/:id/deactivate',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: [TAG],
        summary: 'Desativa a dieta (o usuario fica sem dieta ativa)',
        security: [{ bearerAuth: [] }],
        params: dietIdParamsSchema,
        response: { 200: dietDetailSchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(await changeDietActivation(request.user.sub, request.params.id, false)),
  );
};
