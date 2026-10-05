import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { errorResponseSchema } from '../admin.schemas.js';
import { ratingListResponseSchema, listRatingsQuerySchema } from './admin-ratings.schemas.js';
import { getRatings } from './admin-ratings.service.js';

/** Avaliacoes do app — escopo `admin` (admin e super_user; user recebe 403). */
export const adminRatingsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/ratings',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Lista avaliacoes do app (paginado) com a nota media',
        description:
          'Ordenado por date desc; from/to inclusivos. averageRank considera todo o filtro.',
        security: [{ bearerAuth: [] }],
        querystring: listRatingsQuerySchema,
        response: {
          200: ratingListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => reply.status(200).send(await getRatings(request.query)),
  );
};
