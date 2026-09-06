import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { env } from '../config/env.js';
import { hasRole, isRole, type Role } from '../shared/auth/index.js';
import { AppError } from '../shared/errors/index.js';

/**
 * Infraestrutura de autenticacao/autorizacao.
 *
 * A Fase 0 nao expoe rotas /auth (isso e 1.1): aqui ficam apenas os decorators que as
 * features consomem. `authenticate` valida o token exclusivamente pelas claims — nao
 * consulta o banco, porque a tabela `users` so existe a partir da Fase 1.1.
 *
 * Quando `users` existir, a checagem de `status` (banned/inactive -> 403) entra aqui.
 */
async function authPlugin(app: FastifyInstance): Promise<void> {
  await app.register(jwt, {
    secret: env.JWT_ACCESS_SECRET,
    sign: { expiresIn: env.JWT_ACCESS_TTL },
  });

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      // A causa exata (expirado, assinatura invalida, ausente) fica no log do @fastify/jwt;
      // o cliente recebe sempre a mesma resposta para nao virar oraculo de tokens.
      throw AppError.unauthorized();
    }

    if (request.user.typ !== 'access') {
      // Sem esta checagem um refresh token de 30 dias valeria como access token de 15 min.
      throw AppError.unauthorized('Token de acesso invalido');
    }

    if (!isRole(request.user.role)) {
      throw AppError.unauthorized('Token de acesso invalido');
    }
  });

  app.decorate(
    'requireRole',
    (minimum: Role) => async (request: FastifyRequest, _reply: FastifyReply) => {
      // request.user so existe se `authenticate` rodou antes neste mesmo preHandler.
      if (!request.user) {
        throw AppError.unauthorized();
      }

      if (!hasRole(request.user.role, minimum)) {
        throw AppError.forbidden(`Requer papel '${minimum}' ou superior`);
      }
    },
  );
}

export default fp(authPlugin, { name: 'auth' });
