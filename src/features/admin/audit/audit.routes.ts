import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { SUPER_USER_ONLY, errorResponseSchema } from '../admin.schemas.js';
import {
  auditLogListResponseSchema,
  exportAuditLogsQuerySchema,
  listAuditLogsQuerySchema,
} from './audit.schemas.js';
import { AUDIT_EXPORT_MAX_ROWS, exportAuditLogsCsv, getAuditLogs } from './audit.service.js';

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

  app.get(
    '/audit-logs/export',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Exporta o log de acoes administrativas em CSV',
        description:
          `${SUPER_USER_ONLY} Mesmos filtros de GET /admin/audit-logs, sem paginacao. ` +
          `Ate ${String(AUDIT_EXPORT_MAX_ROWS)} linhas, mais recentes primeiro; o header ` +
          'X-Total-Count traz o total do filtro e X-Export-Truncated: true indica corte.',
        security: [{ bearerAuth: [] }],
        querystring: exportAuditLogsQuerySchema,
        produces: ['text/csv'],
        response: {
          200: z.string().describe('CSV UTF-8 (com BOM), separador virgula'),
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { csv, total, truncated } = await exportAuditLogsCsv(request.query);
      const today = new Date().toISOString().slice(0, 10);

      return reply
        .status(200)
        .header('content-type', 'text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="audit-logs-${today}.csv"`)
        .header('x-total-count', String(total))
        .header('x-export-truncated', String(truncated))
        .send(csv);
    },
  );
};
