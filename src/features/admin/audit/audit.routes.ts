import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { SUPER_USER_ONLY, errorResponseSchema } from '../admin.schemas.js';
import { auditLogListResponseSchema, listAuditLogsQuerySchema } from './audit.schemas.js';
import { getAuditLogs } from './audit.service.js';

/** Registrado no escopo super_user de `features/admin/index.ts`. */
export const auditRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/audit-logs',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Log de acoes administrativas (paginado)',
        description: `${SUPER_USER_ONLY} Ordenado por createdAt desc; from/to inclusivos.`,
        security: [{ bearerAuth: [] }],
        querystring: listAuditLogsQuerySchema,
        response: {
          200: auditLogListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => reply.status(200).send(await getAuditLogs(request.query)),
  );
};
