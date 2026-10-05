import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  addSheet,
  duplicateSheet,
  editSheet,
  getSheetDetail,
  getSheets,
  removeSheet,
  reorderSheetDayExercises,
} from './workout-sheets.service.js';
import {
  createWorkoutSheetBodySchema,
  duplicateWorkoutSheetBodySchema,
  errorResponseSchema,
  reorderExercisesBodySchema,
  sheetDetailResponseSchema,
  sheetIdParamsSchema,
  sheetListResponseSchema,
  updateWorkoutSheetBodySchema,
} from './workout-sheets.schemas.js';

export const workoutSheetsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Planilhas'],
        summary: 'Lista planilhas do usuario',
        security: [{ bearerAuth: [] }],
        response: { 200: sheetListResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const items = await getSheets(request.user.sub);

      return reply.status(200).send({ items });
    },
  );

  app.post(
    '',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Planilhas'],
        summary: 'Cria planilha com dias e exercicios',
        security: [{ bearerAuth: [] }],
        body: createWorkoutSheetBodySchema,
        response: {
          201: sheetDetailResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const sheet = await addSheet(request.user.sub, request.body);

      return reply.status(201).send(sheet);
    },
  );

  app.get(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Planilhas'],
        summary: 'Detalhe completo da planilha',
        security: [{ bearerAuth: [] }],
        params: sheetIdParamsSchema,
        response: {
          200: sheetDetailResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const sheet = await getSheetDetail(request.user.sub, request.params.id);

      return reply.status(200).send(sheet);
    },
  );

  app.patch(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Planilhas'],
        summary: 'Atualiza nome e/ou dias e exercicios (substitui por completo)',
        security: [{ bearerAuth: [] }],
        params: sheetIdParamsSchema,
        body: updateWorkoutSheetBodySchema,
        response: {
          200: sheetDetailResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const sheet = await editSheet(request.user.sub, request.params.id, request.body);

      return reply.status(200).send(sheet);
    },
  );

  app.delete(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Planilhas'],
        summary: 'Remove (soft delete) a planilha',
        security: [{ bearerAuth: [] }],
        params: sheetIdParamsSchema,
        response: {
          204: z.void(),
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await removeSheet(request.user.sub, request.params.id);

      return reply.status(204).send();
    },
  );

  app.post(
    '/:id/duplicate',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Planilhas'],
        summary: 'Duplica a planilha com dias e exercicios',
        description:
          'Cria uma planilha nova copiando dias, ordem, metas e descanso padrao. Body opcional.',
        security: [{ bearerAuth: [] }],
        params: sheetIdParamsSchema,
        body: duplicateWorkoutSheetBodySchema,
        response: {
          201: sheetDetailResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const sheet = await duplicateSheet(request.user.sub, request.params.id, request.body);

      return reply.status(201).send(sheet);
    },
  );

  app.patch(
    '/:id/reorder',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Planilhas'],
        summary: 'Reordena exercicios de um dia da planilha',
        security: [{ bearerAuth: [] }],
        params: sheetIdParamsSchema,
        body: reorderExercisesBodySchema,
        response: {
          200: sheetDetailResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const sheet = await reorderSheetDayExercises(
        request.user.sub,
        request.params.id,
        request.body,
      );

      return reply.status(200).send(sheet);
    },
  );
};
