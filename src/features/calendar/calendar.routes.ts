import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { getDay, getMonth } from './calendar.service.js';
import {
  calendarDayResponseSchema,
  calendarMonthResponseSchema,
  dateParamsSchema,
  errorResponseSchema,
  monthQuerySchema,
} from './calendar.schemas.js';

export const calendarRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Calendario'],
        summary: 'Agregacao mensal de treinos e atividades por dia',
        description:
          'Dias agrupados no fuso do perfil (`timezone`, editavel em PATCH /profile). So dias com ' +
          'registro aparecem em `days`.',
        security: [{ bearerAuth: [] }],
        querystring: monthQuerySchema,
        response: {
          200: calendarMonthResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await getMonth(request.user.sub, request.query);

      return reply.status(200).send(result);
    },
  );

  app.get(
    '/:date',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Calendario'],
        summary: 'Detalhe do dia: sessoes e atividades',
        description:
          'Dia local no fuso do perfil. Itens em ordem de performedAt (mais antigo primeiro). ' +
          'Dia sem registro responde 200 com listas vazias.',
        security: [{ bearerAuth: [] }],
        params: dateParamsSchema,
        response: {
          200: calendarDayResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await getDay(request.user.sub, request.params.date);

      return reply.status(200).send(result);
    },
  );
};
