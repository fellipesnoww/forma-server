import type { onRequestHookHandler } from 'fastify';

import type { PrismaClient } from '../generated/prisma/client.js';
import type { Role } from '../shared/auth/roles.js';

/** Claims carregadas pelo access token emitido pelas rotas /auth (Fase 1.1). */
export interface AccessTokenPayload {
  /** `users.id` do usuario autenticado. */
  sub: string;
  role: Role;
  /** Distingue access de refresh: `authenticate` recusa qualquer coisa != 'access'. */
  typ: 'access' | 'refresh';
}

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    /** preHandler: valida o Bearer token e popula `request.user`. */
    authenticate: onRequestHookHandler;
    /** preHandler: exige `minimum` ou superior na hierarquia. Usar depois de `authenticate`. */
    requireRole: (minimum: Role) => onRequestHookHandler;
  }

  interface FastifyRequest {
    user: AccessTokenPayload;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}
