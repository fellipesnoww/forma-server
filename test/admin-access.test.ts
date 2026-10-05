import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { prisma } from '../src/shared/db/client.js';
import { createTestContext, type TestContext, type TestUser } from './helpers.js';

/**
 * Fases 3.1 e 3.6: guards do namespace `/admin` e escalada de permissao. A matriz e montada
 * a partir do /docs/json, entao rota admin nova entra no teste sem precisar ser listada aqui
 * (so as exclusivas de super_user precisam estar em SUPER_ONLY).
 */

const SUPER_ONLY = new Set([
  'PATCH /admin/users/{id}/role',
  'GET /admin/admins',
  'PATCH /admin/admins/{id}/role',
  'GET /admin/audit-logs',
  'GET /admin/audit-logs/export',
]);

let ctx: TestContext;
let user: TestUser;
let admin: TestUser;
let superUser: TestUser;
let adminRoutes: { method: string; path: string; route: string }[];

before(async () => {
  ctx = await createTestContext();
  [user, admin, superUser] = await Promise.all([
    ctx.createUser(),
    ctx.createUser({ role: 'admin' }),
    ctx.createUser({ role: 'super_user' }),
  ]);

  const doc = (await ctx.app.inject({ method: 'GET', url: '/docs/json' })).json<{
    paths: Record<string, Record<string, unknown>>;
  }>();

  adminRoutes = Object.entries(doc.paths)
    .filter(([path]) => path.startsWith('/admin/'))
    .flatMap(([path, ops]) =>
      Object.keys(ops).map((method) => ({
        method: method.toUpperCase(),
        path,
        route: `${method.toUpperCase()} ${path}`,
      })),
    );
});

after(async () => {
  await ctx.close();
});

async function statusesFor(actor: TestUser) {
  return Promise.all(
    adminRoutes.map(async ({ method, path, route }) => {
      const url = path.replace(/\{[^}]+\}/g, randomUUID());
      const response = await ctx.request(actor, { method: method as 'GET', url, payload: {} });

      return { route, status: response.statusCode };
    }),
  );
}

describe('guards do namespace /admin', () => {
  it('cobre todas as rotas admin documentadas', () => {
    assert.equal(adminRoutes.length, 26);
    SUPER_ONLY.forEach((route) => {
      assert.ok(
        adminRoutes.some((r) => r.route === route),
        `${route} nao documentada`,
      );
    });
  });

  it('user recebe 403 em TODAS as rotas /admin', async () => {
    const results = await statusesFor(user);

    assert.deepEqual(
      results.filter((result) => result.status !== 403),
      [],
    );
  });

  it('admin recebe 403 exatamente nas rotas exclusivas de super_user', async () => {
    const results = await statusesFor(admin);
    const forbidden = results.filter((r) => r.status === 403).map((r) => r.route);

    assert.deepEqual(forbidden.sort(), [...SUPER_ONLY].sort());
  });

  it('super_user nao recebe 403 em nenhuma rota /admin', async () => {
    const results = await statusesFor(superUser);

    assert.deepEqual(
      results.filter((result) => result.status === 403),
      [],
    );
  });

  it('admin banido -> 403 de conta (nao de papel)', async () => {
    const banned = await ctx.createUser({ role: 'admin', status: 'banned' });
    const response = await ctx.request(banned, { method: 'GET', url: '/admin/users' });

    assert.equal(response.statusCode, 403);
    assert.match(response.json<{ error: { message: string } }>().error.message, /banida/);
  });
});

describe('papel lido do banco (token antigo nao carrega privilegio)', () => {
  it('admin rebaixado perde acesso no proximo request, com o mesmo token', async () => {
    const demoted = await ctx.createUser({ role: 'admin' });

    assert.equal(
      (await ctx.request(demoted, { method: 'GET', url: '/admin/users' })).statusCode,
      200,
    );

    await prisma.user.update({ where: { id: demoted.id }, data: { role: 'user' } });

    assert.equal(
      (await ctx.request(demoted, { method: 'GET', url: '/admin/users' })).statusCode,
      403,
    );
  });

  it('token forjado com role=super_user para conta user -> 403', async () => {
    const forged = ctx.app.jwt.sign({ sub: user.id, role: 'super_user', typ: 'access' });
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/admin/audit-logs',
      headers: { authorization: `Bearer ${forged}` },
    });

    assert.equal(response.statusCode, 403);
  });

  it('usuario promovido ganha acesso sem precisar de token novo', async () => {
    const promoted = await ctx.createUser();

    await prisma.user.update({ where: { id: promoted.id }, data: { role: 'admin' } });

    assert.equal(
      (await ctx.request(promoted, { method: 'GET', url: '/admin/users' })).statusCode,
      200,
    );
  });
});
