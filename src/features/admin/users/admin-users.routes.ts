import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { SUPER_USER_ONLY, errorResponseSchema, idParamsSchema, toActor } from '../admin.schemas.js';
import {
  adminUserDetailSchema,
  adminUserListResponseSchema,
  adminUserSummarySchema,
  listAdminsQuerySchema,
  listUsersQuerySchema,
  promoteUserBodySchema,
  updateAdminRoleBodySchema,
  updateUserStatusBodySchema,
} from './admin-users.schemas.js';
import {
  changeUserRole,
  changeUserStatus,
  getAdmins,
  getUserDetail,
  getUsers,
} from './admin-users.service.js';

/** Gestao de usuarios (Fase 3.3) — escopo `admin`. */
export const adminUsersRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/users',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Lista usuarios (paginado)',
        description: 'Ordenado por createdAt desc. Filtros q (email/nome), status e role.',
        security: [{ bearerAuth: [] }],
        querystring: listUsersQuerySchema,
        response: {
          200: adminUserListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => reply.status(200).send(await getUsers(request.query)),
  );

  app.get(
    '/users/:id',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Perfil do usuario + estatisticas de uso',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        response: {
          200: adminUserDetailSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => reply.status(200).send(await getUserDetail(request.params.id)),
  );

  app.patch(
    '/users/:id/status',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Ativa, desativa ou bane a conta',
        description:
          'Admin so altera contas user; contas admin/super_user exigem super_user (403). ' +
          'A propria conta -> 403. inactive/banned derruba o access token no proximo request ' +
          'e invalida os refresh tokens. Repetir o status atual e no-op (sem audit log).',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        body: updateUserStatusBodySchema,
        response: {
          200: adminUserSummarySchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(await changeUserStatus(toActor(request.user), request.params.id, request.body)),
  );
};

/** Gestao de papeis (Fases 3.3 e 3.4) — escopo `super_user`. */
export const superUserRoutes: FastifyPluginAsyncZod = async (app) => {
  app.patch(
    '/users/:id/role',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Promove usuario para admin',
        description:
          `${SUPER_USER_ONLY} So user -> admin (ja admin = no-op). Alvo super_user -> 409 ` +
          '(use /admin/admins/:id/role). Conta nao ativa -> 409. Proprio usuario -> 403.',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        body: promoteUserBodySchema,
        response: {
          200: adminUserSummarySchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(
          await changeUserRole(toActor(request.user), request.params.id, request.body, 'promote'),
        ),
  );

  app.get(
    '/admins',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Lista admins e super_users (paginado)',
        description: SUPER_USER_ONLY,
        security: [{ bearerAuth: [] }],
        querystring: listAdminsQuerySchema,
        response: {
          200: adminUserListResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => reply.status(200).send(await getAdmins(request.query)),
  );

  app.patch(
    '/admins/:id/role',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Promove/rebaixa admin ou super_user (ou revoga o acesso)',
        description:
          `${SUPER_USER_ONLY} Alvo precisa ser admin/super_user (senao 404). role=user revoga o ` +
          'acesso admin. Proprio usuario -> 403. Mudanca vale no proximo request do alvo.',
        security: [{ bearerAuth: [] }],
        params: idParamsSchema,
        body: updateAdminRoleBodySchema,
        response: {
          200: adminUserSummarySchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) =>
      reply
        .status(200)
        .send(
          await changeUserRole(toActor(request.user), request.params.id, request.body, 'admins'),
        ),
  );
};
