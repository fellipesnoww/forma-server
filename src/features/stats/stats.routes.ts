import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { errorResponseSchema, overviewResponseSchema } from './stats.schemas.js';
import { getOverview } from './stats.service.js';

export const statsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/overview',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Estatisticas'],
        summary: 'Numeros do dashboard: volume da semana, treinos do mes e atividades',
        description:
          'Semana = ultimos 7 dias incluindo hoje; mes = mes corrente. Datas no fuso do perfil.',
        security: [{ bearerAuth: [] }],
        response: { 200: overviewResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => reply.status(200).send(await getOverview(request.user.sub)),
  );
};
