import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

import { env } from '../config/env.js';
import { findUserAccess, hasRole, isRole, type Role } from '../shared/auth/index.js';
import { AppError } from '../shared/errors/index.js';

/**
 * Infraestrutura de autenticacao/autorizacao. `authenticate` valida o access token pelas
 * claims e depois confirma em `users` que a conta segue `active` — a checagem de status
 * vive aqui (nao em `features/auth/`) para nao ter que ser repetida em toda rota protegida.
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

    // Consulta a conta a cada requisicao: e o unico jeito de reagir a um ban/desativacao
    // acontecidos depois que o access token foi emitido (o token em si so expira em 15 min).
    const access = await findUserAccess(request.user.sub);

    if (!access) {
      throw AppError.unauthorized();
    }

    if (access.status !== 'active') {
      throw AppError.forbidden('Conta banida ou inativa');
    }

    // O papel do banco prevalece sobre a claim: um admin rebaixado em /admin/admins/:id/role
    // perde o acesso no proximo request, sem esperar o token expirar (Fase 3.1).
    request.user.role = access.role;
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
