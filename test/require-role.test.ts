import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createTestContext, type TestContext, type TestUser } from './helpers.js';

/**
 * Nenhuma rota da Fase 1 usa `requireRole` (rotas admin chegam na Fase 3), entao o
 * decorator e exercitado por rotas de teste registradas so neste app — sem elas a regra
 * de hierarquia so seria testada no dia em que a primeira rota admin existir.
 */

let ctx: TestContext;
const users: Partial<Record<'user' | 'admin' | 'super_user', TestUser>> = {};

before(async () => {
  ctx = await createTestContext((app) => {
    app.get('/__test/admin', { onRequest: [app.authenticate, app.requireRole('admin')] }, () => ({
      ok: true,
    }));
    app.get(
      '/__test/super',
      { onRequest: [app.authenticate, app.requireRole('super_user')] },
      () => ({ ok: true }),
    );
  });

  users.user = await ctx.createUser();
  users.admin = await ctx.createUser({ role: 'admin' });
  users.super_user = await ctx.createUser({ role: 'super_user' });
});

after(async () => {
  await ctx.close();
});

describe('requireRole', () => {
  const matrix = [
    ['user', '/__test/admin', 403],
    ['admin', '/__test/admin', 200],
    ['super_user', '/__test/admin', 200],
    ['user', '/__test/super', 403],
    ['admin', '/__test/super', 403],
    ['super_user', '/__test/super', 200],
  ] as const;

  matrix.forEach(([role, url, expected]) => {
    it(`${role} em ${url} -> ${expected}`, async () => {
      const response = await ctx.request(users[role]!, { method: 'GET', url });

      assert.equal(response.statusCode, expected, response.body);
    });
  });

  it('sem token -> 401 (authenticate roda antes de requireRole)', async () => {
    const response = await ctx.request(null, { method: 'GET', url: '/__test/admin' });

    assert.equal(response.statusCode, 401);
  });
});
