import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, it } from 'node:test';

import { PNG_1X1_BASE64, createTestContext, type TestContext, type TestUser } from './helpers.js';

/**
 * Smoke test da Fase 1: o fluxo principal do app, pelas rotas reais e na ordem em que as
 * telas as chamam — login → planilha → sessao → historico. Um unico teste sequencial de
 * proposito: cada passo depende do anterior, e a falha aponta o primeiro elo quebrado.
 */

let ctx: TestContext;

before(async () => {
  ctx = await createTestContext();
});

after(async () => {
  await ctx.close();
});

it('login -> planilha -> sessao -> historico', async () => {
  // 1. Cadastro e login reais (nao o atalho do helper): valida a emissao de tokens da 1.1
  const email = `smoke-${randomUUID()}@example.com`;
  const register = await ctx.request(null, {
    method: 'POST',
    url: '/auth',
    payload: { email, password: 'senha123', displayName: 'Smoke' },
  });
  assert.equal(register.statusCode, 201, register.body);
  ctx.trackUser(register.json<{ user: { id: string } }>().user.id);

  const login = await ctx.request(null, {
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: 'senha123' },
  });
  assert.equal(login.statusCode, 200, login.body);
  const { accessToken, user } = login.json<{ accessToken: string; user: { id: string } }>();
  const me: TestUser = { id: user.id, email, token: accessToken };

  const whoAmI = await ctx.request(me, { method: 'GET', url: '/auth/me' });
  assert.equal(whoAmI.json<{ profile: { displayName: string } }>().profile.displayName, 'Smoke');

  // 2. Escolhe exercicios: um do catalogo (seed) e um personalizado
  const catalog = await ctx.request(me, { method: 'GET', url: '/exercises?q=supino' });
  const catalogId = catalog
    .json<{ items: { id: string; source: string }[] }>()
    .items.find((item) => item.source === 'catalog')?.id;
  assert.ok(catalogId, 'catalogo sem "supino" — rode `yarn db:seed`');

  const custom = await ctx.request(me, {
    method: 'POST',
    url: '/exercises/custom',
    payload: { name: 'Prancha com peso' },
  });
  assert.equal(custom.statusCode, 201, custom.body);
  const customId = custom.json<{ id: string }>().id;

  // 3. Planilha com dois dias
  const sheet = await ctx.request(me, {
    method: 'POST',
    url: '/workout-sheets',
    payload: {
      name: 'Treino AB',
      days: [
        {
          weekday: 1,
          order: 0,
          exercises: [{ exerciseId: catalogId, sortOrder: 0, targetSets: 3, targetReps: 10 }],
        },
        { weekday: 4, order: 1, exercises: [{ customExerciseId: customId, sortOrder: 0 }] },
      ],
    },
  });
  assert.equal(sheet.statusCode, 201, sheet.body);
  const sheetId = sheet.json<{ id: string }>().id;

  // 4. Sessao de hoje (em andamento) e uma retroativa
  const today = await ctx.request(me, {
    method: 'POST',
    url: '/workout-sessions',
    payload: {
      sheetId,
      exercises: [
        {
          exerciseId: catalogId,
          sortOrder: 0,
          sets: [
            { setNumber: 1, reps: 10, weightKg: 40 },
            { setNumber: 2, reps: 10, weightKg: 40 },
          ],
        },
      ],
    },
  });
  assert.equal(today.statusCode, 201, today.body);
  const sessionId = today.json<{ id: string }>().id;

  const backdated = await ctx.request(me, {
    method: 'POST',
    url: '/workout-sessions',
    payload: {
      sheetId,
      performedAt: '2026-01-15T10:00:00.000Z',
      exercises: [
        {
          customExerciseId: customId,
          sortOrder: 0,
          sets: [{ setNumber: 1, reps: 1, weightKg: 0 }],
        },
      ],
    },
  });
  assert.equal(backdated.statusCode, 201, backdated.body);

  // 5. Executa: marca series, envia foto, finaliza (duas vezes — idempotente)
  const progress = await ctx.request(me, {
    method: 'PATCH',
    url: `/workout-sessions/${sessionId}`,
    payload: {
      comment: 'Ultima serie pesada',
      exercises: [
        {
          exerciseId: catalogId,
          sortOrder: 0,
          sets: [
            { setNumber: 1, reps: 10, weightKg: 40, completed: true },
            { setNumber: 2, reps: 8, weightKg: 42.5, completed: true },
          ],
        },
      ],
    },
  });
  assert.equal(progress.statusCode, 200, progress.body);

  const photo = await ctx.request(me, {
    method: 'POST',
    url: `/workout-sessions/${sessionId}/photo`,
    payload: { data: PNG_1X1_BASE64, mimeType: 'image/png' },
  });
  assert.equal(photo.statusCode, 200, photo.body);
  const { photoUrl } = photo.json<{ photoUrl: string }>();

  const photoBytes = await ctx.request(me, { method: 'GET', url: photoUrl });
  assert.equal(photoBytes.statusCode, 200);

  const done = await ctx.request(me, {
    method: 'POST',
    url: `/workout-sessions/${sessionId}/complete`,
  });
  const again = await ctx.request(me, {
    method: 'POST',
    url: `/workout-sessions/${sessionId}/complete`,
  });
  const { completedAt } = done.json<{ completedAt: string | null }>();
  assert.ok(completedAt);
  assert.equal(again.json<{ completedAt: string }>().completedAt, completedAt);

  // 6. Historico: tudo, por periodo e por planilha
  const history = await ctx.request(me, { method: 'GET', url: '/workout-sessions' });
  const historyJson = history.json<{ total: number; items: { id: string; sheetName: string }[] }>();
  assert.equal(historyJson.total, 2);
  assert.equal(historyJson.items[0]!.id, sessionId, 'mais recente (performedAt) primeiro');
  assert.equal(historyJson.items[0]!.sheetName, 'Treino AB');

  const january = await ctx.request(me, {
    method: 'GET',
    url: '/workout-sessions?from=2026-01-01T00:00:00Z&to=2026-01-31T23:59:59Z',
  });
  assert.equal(january.json<{ total: number }>().total, 1);

  const bySheet = await ctx.request(me, {
    method: 'GET',
    url: `/workout-sessions?sheetId=${sheetId}&limit=1`,
  });
  assert.equal(bySheet.json<{ total: number; items: unknown[] }>().total, 2);
  assert.equal(bySheet.json<{ items: unknown[] }>().items.length, 1);

  // 7. Detalhe final reflete tudo o que foi feito
  const detail = await ctx.request(me, { method: 'GET', url: `/workout-sessions/${sessionId}` });
  const session = detail.json<{
    comment: string;
    photoUrl: string;
    completedAt: string;
    exercises: { name: string; sets: { weightKg: number; completed: boolean }[] }[];
  }>();
  assert.equal(session.comment, 'Ultima serie pesada');
  assert.equal(session.photoUrl, photoUrl);
  assert.equal(session.completedAt, completedAt);
  assert.deepEqual(
    session.exercises[0]!.sets.map((set) => [set.weightKg, set.completed]),
    [
      [40, true],
      [42.5, true],
    ],
  );

  // 8. Remover a planilha nao apaga o historico
  const removed = await ctx.request(me, { method: 'DELETE', url: `/workout-sheets/${sheetId}` });
  assert.equal(removed.statusCode, 204);
  const afterRemoval = await ctx.request(me, { method: 'GET', url: '/workout-sessions' });
  assert.equal(afterRemoval.json<{ total: number }>().total, 2);

  // 9. Logout invalida o refresh token
  const { refreshToken } = login.json<{ refreshToken: string }>();
  await ctx.request(me, { method: 'POST', url: '/auth/logout' });
  const refresh = await ctx.request(null, {
    method: 'POST',
    url: '/auth/refresh',
    payload: { refreshToken },
  });
  assert.equal(refresh.statusCode, 401);
});
