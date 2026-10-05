import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { createRatingBodySchema, errorResponseSchema, ratingSchema } from './ratings.schemas.js';
import { addRating } from './ratings.service.js';

export const ratingsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Avaliacoes'],
        summary: 'Envia uma avaliacao do app (nota 1–5 + observacao)',
        description:
          'Qualquer usuario autenticado. A data e definida pelo servidor. A leitura das ' +
          'avaliacoes e exclusiva do painel admin (GET /admin/ratings).',
        security: [{ bearerAuth: [] }],
        body: createRatingBodySchema,
        response: { 201: ratingSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await addRating(request.user.sub, request.body)),
  );
};
