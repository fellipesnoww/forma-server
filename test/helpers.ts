import { randomUUID } from 'node:crypto';

import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';

import { buildApp } from '../src/app.js';
import type { Role, UserStatus } from '../src/generated/prisma/client.js';
import { prisma } from '../src/shared/db/client.js';

/** PNG 1x1 valido — passa na checagem de magic number de `decodeBase64Media`. */
export const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

export interface TestUser {
  id: string;
  email: string;
  token: string;
}

export interface TestContext {
  app: FastifyInstance;
  /** `app.inject` com o Bearer do usuario informado (ou sem auth quando `user` e null). */
  request: (user: TestUser | null, options: InjectOptions) => Promise<LightMyRequestResponse>;
  /**
   * Cria usuario + perfil direto no banco e assina um access token, como `yarn token:dev`.
   * Evita `POST /auth`, que tem rate limit estrito (10/min) e nao permite escolher role/status.
   */
  createUser: (options?: { role?: Role; status?: UserStatus }) => Promise<TestUser>;
  /** Marca para limpeza um usuario criado pela API (ex.: `POST /auth` no smoke test). */
  trackUser: (id: string) => void;
  /** Remove usuarios criados pelo contexto (cascade) e a midia deles; fecha o app. */
  close: () => Promise<void>;
}

/**
 * Sobe o app real (`buildApp`) contra o Postgres do `.env`, sem `listen`: as requisicoes vao
 * por `app.inject`. `configure` roda antes do `ready()`, para registrar rotas so de teste.
 */
export async function createTestContext(
  configure?: (app: FastifyInstance) => void,
): Promise<TestContext> {
  const app = await buildApp();
  configure?.(app);
  await app.ready();

  const userIds: string[] = [];

  return {
    app,

    request: (user, options) =>
      app.inject({
        ...options,
        headers: {
          ...options.headers,
          ...(user ? { authorization: `Bearer ${user.token}` } : {}),
        },
      }),

    createUser: async ({ role = 'user', status = 'active' } = {}) => {
      const email = `test-${randomUUID()}@example.com`;
      const user = await prisma.user.create({
        data: { email, role, status, profile: { create: {} } },
      });

      userIds.push(user.id);

      return { id: user.id, email, token: app.jwt.sign({ sub: user.id, role, typ: 'access' }) };
    },

    trackUser: (id) => {
      userIds.push(id);
    },

    close: async () => {
      // `media_assets.owner_id` nao tem FK (Fase 0), entao nao cai no cascade de `users`
      await prisma.mediaAsset.deleteMany({ where: { ownerId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await app.close();
    },
  };
}

export async function findCatalogExerciseId(ctx: TestContext, user: TestUser): Promise<string> {
  const response = await ctx.request(user, { method: 'GET', url: '/exercises' });
  const { items } = response.json<{ items: { id: string; source: string }[] }>();
  const catalog = items.find((item) => item.source === 'catalog');

  if (!catalog) {
    throw new Error('Catalogo vazio — rode `yarn db:seed` antes dos testes');
  }

  return catalog.id;
}
