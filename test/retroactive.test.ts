import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { isWithinRetroactiveLimit } from '../src/shared/validation/index.js';
import { addDays, isValidLocalDate, monthRange, todayIn } from '../src/shared/time/index.js';
import {
  createTestContext,
  findCatalogExerciseId,
  type TestContext,
  type TestUser,
} from './helpers.js';

/**
 * Regras da 2.3 (registro retroativo). `yarn test` roda com RETROACTIVE_MAX_DAYS=3650; o
 * futuro rejeitado tambem e coberto por feature em workout-sessions/activities.test.ts.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const LIMIT_DAYS = 3650;

let ctx: TestContext;
let user: TestUser;
let sheetId: string;
let catalogId: string;
let typeId: string;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function postSession(performedAt: string) {
  return ctx.request(user, {
    method: 'POST',
    url: '/workout-sessions',
    payload: {
      sheetId,
      performedAt,
      exercises: [
        { exerciseId: catalogId, sortOrder: 0, sets: [{ setNumber: 1, reps: 1, weightKg: 1 }] },
      ],
    },
  });
}

function postActivity(performedAt: string) {
  return ctx.request(user, {
    method: 'POST',
    url: '/activities',
    payload: { activityTypeId: typeId, performedAt, durationMinutes: 10 },
  });
}

before(async () => {
  ctx = await createTestContext();
  user = await ctx.createUser();
  catalogId = await findCatalogExerciseId(ctx, user);
  typeId = (await ctx.request(user, { method: 'GET', url: '/activity-types' })).json<{
    items: { id: string }[];
  }>().items[0]!.id;
  sheetId = (
    await ctx.request(user, {
      method: 'POST',
      url: '/workout-sheets',
      payload: {
        name: 'Retroativo',
        days: [{ weekday: 1, order: 0, exercises: [{ exerciseId: catalogId, sortOrder: 0 }] }],
      },
    })
  ).json<{ id: string }>().id;
});

after(async () => {
  await ctx.close();
});

describe('limite retroativo (RETROACTIVE_MAX_DAYS)', () => {
  it('dentro do limite e aceito em sessoes e atividades', async () => {
    const within = daysAgo(LIMIT_DAYS - 1);

    assert.equal((await postSession(within)).statusCode, 201);
    assert.equal((await postActivity(within)).statusCode, 201);
  });

  it('alem do limite -> 400 em POST de sessoes e atividades', async () => {
    const beyond = daysAgo(LIMIT_DAYS + 1);

    assert.equal((await postSession(beyond)).statusCode, 400);
    assert.equal((await postActivity(beyond)).statusCode, 400);
  });

  it('alem do limite -> 400 em PATCH de sessoes e atividades', async () => {
    const session = (await postSession(daysAgo(1))).json<{ id: string }>();
    const activity = (await postActivity(daysAgo(1))).json<{ id: string }>();
    const beyond = daysAgo(LIMIT_DAYS + 1);

    const patchedSession = await ctx.request(user, {
      method: 'PATCH',
      url: `/workout-sessions/${session.id}`,
      payload: { performedAt: beyond },
    });
    const patchedActivity = await ctx.request(user, {
      method: 'PATCH',
      url: `/activities/${activity.id}`,
      payload: { performedAt: beyond },
    });

    assert.deepEqual([patchedSession.statusCode, patchedActivity.statusCode], [400, 400]);
  });

  it('o limite aparece na descricao OpenAPI de performedAt', async () => {
    const doc = JSON.stringify((await ctx.app.inject({ method: 'GET', url: '/docs/json' })).json());

    assert.ok(doc.includes(`ate ${String(LIMIT_DAYS)} dias atras`));
  });
});

describe('isWithinRetroactiveLimit', () => {
  const now = Date.parse('2026-10-03T12:00:00.000Z');

  it('sem limite aceita qualquer data passada', () => {
    assert.ok(isWithinRetroactiveLimit(new Date('1990-01-01T00:00:00Z'), undefined, now));
  });

  it('janela de N x 24h: exatamente no limite aceita, 1 ms antes rejeita', () => {
    const edge = now - 90 * DAY_MS;

    assert.ok(isWithinRetroactiveLimit(new Date(edge), 90, now));
    assert.ok(!isWithinRetroactiveLimit(new Date(edge - 1), 90, now));
  });
});

describe('datas locais', () => {
  it('isValidLocalDate rejeita dia inexistente e formato errado; aceita 29/02 bissexto', () => {
    assert.ok(isValidLocalDate('2024-02-29'));
    assert.ok(!isValidLocalDate('2025-02-29'));
    assert.ok(!isValidLocalDate('2025-13-01'));
    assert.ok(!isValidLocalDate('2025-1-01'));
  });

  it('addDays atravessa mes e ano', () => {
    assert.equal(addDays('2025-12-31', 1), '2026-01-01');
    assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  });

  it('monthRange de dezembro termina em janeiro do ano seguinte', () => {
    assert.deepEqual(monthRange(2025, 12), { from: '2025-12-01', toExclusive: '2026-01-01' });
  });

  it('todayIn usa o fuso: 02:00Z ainda e o dia anterior em Sao Paulo', () => {
    const instant = new Date('2025-03-10T02:00:00.000Z');

    assert.equal(todayIn('America/Sao_Paulo', instant), '2025-03-09');
    assert.equal(todayIn('UTC', instant), '2025-03-10');
    assert.equal(todayIn('Asia/Tokyo', new Date('2025-03-09T15:00:00.000Z')), '2025-03-10');
  });
});
