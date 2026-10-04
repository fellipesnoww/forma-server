import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { prisma } from '../src/shared/db/client.js';
import {
  PNG_1X1_BASE64,
  auditLogsFor,
  createTestContext,
  mediaIdFromUrl,
  type TestContext,
  type TestUser,
} from './helpers.js';

interface Achievement {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  criteria: Record<string, unknown>;
  isActive: boolean;
  unlockCount: number;
}

interface Challenge {
  id: string;
  name: string;
  goal: Record<string, unknown>;
  reward: string | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  period: 'upcoming' | 'ongoing' | 'ended';
  participantCount: number;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

let ctx: TestContext;
let admin: TestUser;
let defaultTypeId: string;
let customTypeId: string;

const TAG = `zz-test-${randomUUID().slice(0, 8)}`;
const DAY = 24 * 60 * 60 * 1000;

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

before(async () => {
  ctx = await createTestContext();
  admin = await ctx.createUser({ role: 'admin' });

  const owner = await ctx.createUser();
  defaultTypeId = (await prisma.activityType.findFirstOrThrow({ where: { userId: null } })).id;
  customTypeId = (
    await prisma.activityType.create({ data: { userId: owner.id, name: `${TAG} custom` } })
  ).id;
});

after(async () => {
  const achievements = await prisma.achievement.findMany({ where: { name: { startsWith: TAG } } });
  const iconIds = achievements.flatMap((a) => (a.iconUrl ? [mediaIdFromUrl(a.iconUrl)] : []));

  await prisma.achievement.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.challenge.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.mediaAsset.deleteMany({ where: { id: { in: iconIds } } });
  await ctx.close();
});

function post(url: string, payload: Record<string, unknown>) {
  return ctx.request(admin, { method: 'POST', url, payload });
}

function patch(url: string, payload: Record<string, unknown>) {
  return ctx.request(admin, { method: 'PATCH', url, payload });
}

function challengeBody(overrides: Record<string, unknown> = {}) {
  return {
    name: `${TAG} Desafio ${randomUUID().slice(0, 4)}`,
    goal: { type: 'workout_count', count: 12 },
    startsAt: iso(-DAY),
    endsAt: iso(29 * DAY),
    ...overrides,
  };
}

async function createChallenge(overrides: Record<string, unknown> = {}): Promise<Challenge> {
  const response = await post('/admin/challenges', challengeBody(overrides));

  assert.equal(response.statusCode, 201, response.body);

  return response.json<Challenge>();
}

async function createAchievement(overrides: Record<string, unknown> = {}): Promise<Achievement> {
  const response = await post('/admin/achievements', {
    name: `${TAG} Conquista ${randomUUID().slice(0, 4)}`,
    criteria: { type: 'workout_count', count: 10 },
    ...overrides,
  });

  assert.equal(response.statusCode, 201, response.body);

  return response.json<Achievement>();
}

describe('conquistas — criterios', () => {
  [
    { type: 'streak_days', days: 7 },
    { type: 'workout_count', count: 100 },
  ].forEach((criteria) => {
    it(`aceita ${criteria.type}`, async () => {
      const achievement = await createAchievement({ criteria });

      assert.deepEqual(achievement.criteria, criteria);
      assert.equal(achievement.unlockCount, 0);
    });
  });

  it('aceita challenge_complete de desafio existente', async () => {
    const challenge = await createChallenge();
    const achievement = await createAchievement({
      criteria: { type: 'challenge_complete', challengeId: challenge.id },
    });

    assert.equal(achievement.criteria.challengeId, challenge.id);
  });

  [
    ['tipo desconhecido', { type: 'login_count', count: 3 }],
    ['streak sem days', { type: 'streak_days' }],
    ['days zero', { type: 'streak_days', days: 0 }],
    ['count fracionado', { type: 'workout_count', count: 1.5 }],
    ['challengeId nao uuid', { type: 'challenge_complete', challengeId: 'abc' }],
  ].forEach(([label, criteria]) => {
    it(`rejeita ${String(label)} -> 400`, async () => {
      const response = await post('/admin/achievements', {
        name: `${TAG} invalida`,
        criteria,
      });

      assert.equal(response.statusCode, 400);
    });
  });

  it('challenge_complete de desafio inexistente -> 400 sem gravar', async () => {
    const name = `${TAG} Orfa`;
    const response = await post('/admin/achievements', {
      name,
      criteria: { type: 'challenge_complete', challengeId: randomUUID() },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(await prisma.achievement.count({ where: { name } }), 0);
  });
});

describe('conquistas — CRUD', () => {
  it('cria com icone (midia global) e grava audit log', async () => {
    const achievement = await createAchievement({
      description: 'Primeira semana',
      icon: { data: PNG_1X1_BASE64, mimeType: 'image/png' },
    });
    const anyUser = await ctx.createUser();

    assert.ok(achievement.iconUrl);
    assert.equal(
      (
        await ctx.request(anyUser, {
          method: 'GET',
          url: `/media/${mediaIdFromUrl(achievement.iconUrl)}`,
        })
      ).statusCode,
      200,
    );

    const [log] = await auditLogsFor(achievement.id);
    assert.equal(log?.action, 'achievement.created');
  });

  it('nome repetido sem diferenciar maiusculas -> 409 (POST e PATCH)', async () => {
    const a = await createAchievement({ name: `${TAG} Unica` });
    const b = await createAchievement();

    assert.equal(
      (
        await post('/admin/achievements', {
          name: `${TAG} UNICA`,
          criteria: { type: 'streak_days', days: 3 },
        })
      ).statusCode,
      409,
    );
    assert.equal((await patch(`/admin/achievements/${b.id}`, { name: a.name })).statusCode, 409);
  });

  it('GET detalhe, lista com filtro status e busca', async () => {
    const inactive = await createAchievement({ name: `${TAG} Lista off`, isActive: false });
    const active = await createAchievement({ name: `${TAG} Lista on` });

    const detail = await ctx.request(admin, {
      method: 'GET',
      url: `/admin/achievements/${active.id}`,
    });
    assert.equal(detail.json<Achievement>().name, `${TAG} Lista on`);

    const q = encodeURIComponent(`${TAG} Lista`);
    const all = await ctx.request(admin, { method: 'GET', url: `/admin/achievements?q=${q}` });
    const off = await ctx.request(admin, {
      method: 'GET',
      url: `/admin/achievements?q=${q}&status=inactive`,
    });

    assert.equal(all.json<Page<Achievement>>().total, 2);
    assert.deepEqual(
      off.json<Page<Achievement>>().items.map((item) => item.id),
      [inactive.id],
    );
  });

  it('PATCH troca criterio, desativa, remove descricao/icone; audit com antes/depois', async () => {
    const achievement = await createAchievement({
      description: 'x',
      icon: { data: PNG_1X1_BASE64, mimeType: 'image/png' },
    });

    const response = await patch(`/admin/achievements/${achievement.id}`, {
      criteria: { type: 'streak_days', days: 30 },
      isActive: false,
      description: null,
      iconUrl: null,
    });
    const body = response.json<Achievement>();

    assert.equal(response.statusCode, 200);
    assert.deepEqual(body.criteria, { type: 'streak_days', days: 30 });
    assert.equal(body.isActive, false);
    assert.equal(body.description, null);
    assert.equal(body.iconUrl, null);

    const [log] = await auditLogsFor(achievement.id);
    const metadata = log?.metadata as {
      before: { isActive: boolean };
      after: { isActive: boolean };
    };

    assert.equal(log?.action, 'achievement.updated');
    assert.equal(metadata.before.isActive, true);
    assert.equal(metadata.after.isActive, false);
  });

  it('PATCH vazio ou icon + iconUrl null -> 400; inexistente -> 404', async () => {
    const achievement = await createAchievement();

    assert.equal((await patch(`/admin/achievements/${achievement.id}`, {})).statusCode, 400);
    assert.equal(
      (
        await patch(`/admin/achievements/${achievement.id}`, {
          icon: { data: PNG_1X1_BASE64, mimeType: 'image/png' },
          iconUrl: null,
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await patch(`/admin/achievements/${randomUUID()}`, { isActive: false })).statusCode,
      404,
    );
  });

  it('DELETE sem desbloqueios -> 204 + audit; com desbloqueios -> 409', async () => {
    const free = await createAchievement();
    const unlocked = await createAchievement();
    const holder = await ctx.createUser();

    await prisma.userAchievement.create({
      data: { userId: holder.id, achievementId: unlocked.id },
    });

    const removed = await ctx.request(admin, {
      method: 'DELETE',
      url: `/admin/achievements/${free.id}`,
    });
    const blocked = await ctx.request(admin, {
      method: 'DELETE',
      url: `/admin/achievements/${unlocked.id}`,
    });

    assert.equal(removed.statusCode, 204);
    assert.equal((await auditLogsFor(free.id))[0]?.action, 'achievement.deleted');
    assert.equal(blocked.statusCode, 409);
    assert.ok(await prisma.achievement.findUnique({ where: { id: unlocked.id } }));
  });
});

describe('GET /admin/achievements/:id/unlocks', () => {
  it('lista quem desbloqueou, mais recente primeiro, paginado', async () => {
    const achievement = await createAchievement();
    const [first, second] = await Promise.all([ctx.createUser(), ctx.createUser()]);

    await prisma.userAchievement.createMany({
      data: [
        { userId: first.id, achievementId: achievement.id, unlockedAt: new Date(Date.now() - DAY) },
        { userId: second.id, achievementId: achievement.id, unlockedAt: new Date() },
      ],
    });

    const response = await ctx.request(admin, {
      method: 'GET',
      url: `/admin/achievements/${achievement.id}/unlocks?limit=1`,
    });
    const body = response.json<Page<{ userId: string; email: string }>>();

    assert.equal(response.statusCode, 200);
    assert.equal(body.total, 2);
    assert.deepEqual(
      body.items.map((item) => item.email),
      [second.email],
    );

    const detail = await ctx.request(admin, {
      method: 'GET',
      url: `/admin/achievements/${achievement.id}`,
    });
    assert.equal(detail.json<Achievement>().unlockCount, 2);
  });

  it('conquista inexistente -> 404', async () => {
    const response = await ctx.request(admin, {
      method: 'GET',
      url: `/admin/achievements/${randomUUID()}/unlocks`,
    });

    assert.equal(response.statusCode, 404);
  });
});

describe('desafios — CRUD', () => {
  it('cria com metas validas e audit log', async () => {
    const goals = [
      { type: 'workout_count', count: 20 },
      { type: 'activity_count', count: 8, activityTypeId: defaultTypeId },
      { type: 'activity_minutes', minutes: 600 },
    ];

    const created = await Promise.all(
      goals.map((goal) => createChallenge({ goal, reward: 'Selo de ouro' })),
    );

    created.forEach((challenge, index) => {
      assert.deepEqual(challenge.goal, goals[index]);
      assert.equal(challenge.reward, 'Selo de ouro');
      assert.equal(challenge.participantCount, 0);
    });
    assert.equal((await auditLogsFor(created[0]!.id))[0]?.action, 'challenge.created');
  });

  it('activityTypeId de tipo custom ou inexistente -> 400', async () => {
    const custom = await post(
      '/admin/challenges',
      challengeBody({ goal: { type: 'activity_count', count: 3, activityTypeId: customTypeId } }),
    );
    const missing = await post(
      '/admin/challenges',
      challengeBody({
        goal: { type: 'activity_minutes', minutes: 60, activityTypeId: randomUUID() },
      }),
    );

    assert.equal(custom.statusCode, 400);
    assert.equal(missing.statusCode, 400);
  });

  it('endsAt <= startsAt -> 400 (POST e PATCH com valor mesclado)', async () => {
    const start = iso(DAY);

    assert.equal(
      (await post('/admin/challenges', challengeBody({ startsAt: start, endsAt: start })))
        .statusCode,
      400,
    );

    const challenge = await createChallenge();
    const response = await patch(`/admin/challenges/${challenge.id}`, {
      startsAt: iso(60 * DAY),
    });

    assert.equal(response.statusCode, 400);
  });

  it('meta invalida -> 400', async () => {
    const response = await post(
      '/admin/challenges',
      challengeBody({ goal: { type: 'activity_minutes', count: 3 } }),
    );

    assert.equal(response.statusCode, 400);
  });

  it('period calculado e filtro ?period=', async () => {
    const upcoming = await createChallenge({
      name: `${TAG} Periodo futuro`,
      startsAt: iso(DAY),
      endsAt: iso(2 * DAY),
    });
    const ongoing = await createChallenge({ name: `${TAG} Periodo atual` });
    const ended = await createChallenge({
      name: `${TAG} Periodo passado`,
      startsAt: iso(-10 * DAY),
      endsAt: iso(-DAY),
    });

    assert.equal(upcoming.period, 'upcoming');
    assert.equal(ongoing.period, 'ongoing');
    assert.equal(ended.period, 'ended');

    const q = encodeURIComponent(`${TAG} Periodo`);
    const results = await Promise.all(
      (['upcoming', 'ongoing', 'ended'] as const).map(async (period) =>
        (
          await ctx.request(admin, {
            method: 'GET',
            url: `/admin/challenges?q=${q}&period=${period}`,
          })
        )
          .json<Page<Challenge>>()
          .items.map((item) => item.id),
      ),
    );

    assert.deepEqual(results, [[upcoming.id], [ongoing.id], [ended.id]]);
  });

  it('PATCH desativa e troca periodo/recompensa; GET detalhe reflete', async () => {
    const challenge = await createChallenge();
    const endsAt = iso(90 * DAY);
    const response = await patch(`/admin/challenges/${challenge.id}`, {
      isActive: false,
      endsAt,
      reward: null,
    });

    assert.equal(response.statusCode, 200);

    const detail = (
      await ctx.request(admin, { method: 'GET', url: `/admin/challenges/${challenge.id}` })
    ).json<Challenge>();

    assert.equal(detail.isActive, false);
    assert.equal(detail.endsAt, endsAt);
    assert.equal(detail.reward, null);
    assert.equal((await auditLogsFor(challenge.id))[0]?.action, 'challenge.updated');
  });

  it('meta congelada com participantes -> 409; mesma meta reenviada passa', async () => {
    const challenge = await createChallenge({ goal: { type: 'workout_count', count: 5 } });
    const participant = await ctx.createUser();

    await prisma.userChallenge.create({
      data: { userId: participant.id, challengeId: challenge.id, progress: 2 },
    });

    const changed = await patch(`/admin/challenges/${challenge.id}`, {
      goal: { type: 'workout_count', count: 50 },
    });
    const same = await patch(`/admin/challenges/${challenge.id}`, {
      goal: { type: 'workout_count', count: 5 },
      name: `${TAG} Renomeado`,
    });

    assert.equal(changed.statusCode, 409);
    assert.equal(same.statusCode, 200);
    assert.equal(same.json<Challenge>().participantCount, 1);
  });

  it('meta pode mudar enquanto ninguem entrou', async () => {
    const challenge = await createChallenge();
    const response = await patch(`/admin/challenges/${challenge.id}`, {
      goal: { type: 'activity_minutes', minutes: 300 },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json<Challenge>().goal, { type: 'activity_minutes', minutes: 300 });
  });

  it('DELETE: livre -> 204; com participante -> 409; referenciado por conquista -> 409', async () => {
    const free = await createChallenge();
    const joined = await createChallenge();
    const referenced = await createChallenge();
    const participant = await ctx.createUser();

    await prisma.userChallenge.create({ data: { userId: participant.id, challengeId: joined.id } });
    await createAchievement({
      criteria: { type: 'challenge_complete', challengeId: referenced.id },
    });

    const del = (id: string) =>
      ctx.request(admin, { method: 'DELETE', url: `/admin/challenges/${id}` });

    assert.equal((await del(free.id)).statusCode, 204);
    assert.equal((await auditLogsFor(free.id))[0]?.action, 'challenge.deleted');
    assert.equal((await del(joined.id)).statusCode, 409);
    assert.equal((await del(referenced.id)).statusCode, 409);
    assert.equal((await del(randomUUID())).statusCode, 404);
  });
});
