import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { getLoadProgress, getMeasurementProgress } from './progress.service.js';
import {
  errorResponseSchema,
  loadQuerySchema,
  loadResponseSchema,
  measurementsQuerySchema,
  measurementsResponseSchema,
} from './progress.schemas.js';

export const progressRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/load',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Progressao'],
        summary: 'Evolucao de carga de um exercicio por dia',
        description:
          'Agrega todas as series do exercicio nas sessoes do usuario, agrupadas por dia no fuso ' +
          'do perfil. Exercicio sem historico (ou inexistente) responde 200 com points vazio.',
        security: [{ bearerAuth: [] }],
        querystring: loadQuerySchema,
        response: {
          200: loadResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await getLoadProgress(request.user.sub, request.query);

      return reply.status(200).send(result);
    },
  );

  app.get(
    '/measurements',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Progressao'],
        summary: 'Evolucao de uma medida corporal',
        description:
          'Um ponto por registro de POST /profile/measurements que contem a metrica. ' +
          'O intervalo usa createdAt do registro.',
        security: [{ bearerAuth: [] }],
        querystring: measurementsQuerySchema,
        response: {
          200: measurementsResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await getMeasurementProgress(request.user.sub, request.query);

      return reply.status(200).send(result);
    },
  );
};
