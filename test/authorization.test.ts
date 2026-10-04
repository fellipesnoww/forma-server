import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { hasRole } from '../src/shared/auth/index.js';
import { prisma } from '../src/shared/db/client.js';
import { todayIn } from '../src/shared/time/index.js';
import {
  PNG_1X1_BASE64,
  createTestContext,
  findCatalogExerciseId,
  type TestContext,
  type TestUser,
} from './helpers.js';

interface OwnerResources {
  customExerciseId: string;
  sheetId: string;
  dayId: string;
  sheetExerciseId: string;
  sessionId: string;
  mediaId: string;
  activityTypeId: string;
  activityId: string;
}

let ctx: TestContext;
let owner: TestUser;
let intruder: TestUser;
let admin: TestUser;
let superUser: TestUser;
let catalogExerciseId: string;
let res: OwnerResources;

function sessionBody(sheetId: string, ref: { exerciseId?: string; customExerciseId?: string }) {
  return {
    sheetId,
    exercises: [{ ...ref, sortOrder: 0, sets: [{ setNumber: 1, reps: 10, weightKg: 20 }] }],
  };
}

/** Cria, como `owner`, um recurso de cada feature com dono — alvo das tentativas do intruso. */
async function seedOwnerResources(): Promise<OwnerResources> {
  const custom = await ctx.request(owner, {
    method: 'POST',
    url: '/exercises/custom',
    payload: { name: 'Exercicio do dono' },
  });
  const customExerciseId = custom.json<{ id: string }>().id;

  const sheet = await ctx.request(owner, {
    method: 'POST',
    url: '/workout-sheets',
    payload: {
      name: 'Planilha do dono',
      days: [{ weekday: 1, order: 0, exercises: [{ customExerciseId, sortOrder: 0 }] }],
    },
  });
  const sheetJson = sheet.json<{
    id: string;
    days: { id: string; exercises: { id: string }[] }[];
  }>();

  const session = await ctx.request(owner, {
    method: 'POST',
    url: '/workout-sessions',
    payload: sessionBody(sheetJson.id, { customExerciseId }),
  });

  const media = await ctx.request(owner, {
    method: 'POST',
    url: '/media',
    payload: { data: PNG_1X1_BASE64, mimeType: 'image/png' },
  });

  await ctx.request(owner, {
    method: 'POST',
    url: '/profile/measurements',
    payload: { weightKg: 80 },
  });

  const activityType = await ctx.request(owner, {
    method: 'POST',
    url: '/activity-types/custom',
    payload: { name: 'Tipo do dono' },
  });
  const activityTypeId = activityType.json<{ id: string }>().id;

  const activity = await ctx.request(owner, {
    method: 'POST',
    url: '/activities',
    payload: { activityTypeId, durationMinutes: 30 },
  });

  return {
    customExerciseId,
    sheetId: sheetJson.id,
    dayId: sheetJson.days[0]!.id,
    sheetExerciseId: sheetJson.days[0]!.exercises[0]!.id,
    sessionId: session.json<{ id: string }>().id,
    mediaId: media.json<{ id: string }>().id,
    activityTypeId,
    activityId: activity.json<{ id: string }>().id,
  };
}

before(async () => {
  ctx = await createTestContext();
  [owner, intruder, admin, superUser] = await Promise.all([
    ctx.createUser(),
    ctx.createUser(),
    ctx.createUser({ role: 'admin' }),
    ctx.createUser({ role: 'super_user' }),
  ]);
  catalogExerciseId = await findCatalogExerciseId(ctx, owner);
  res = await seedOwnerResources();
});

after(async () => {
  await ctx.close();
});

describe('autenticacao', () => {
  it('toda rota com bearerAuth no OpenAPI responde 401 sem token', async () => {
    const doc = (await ctx.app.inject({ method: 'GET', url: '/docs/json' })).json<{
      paths: Record<string, Record<string, { security?: unknown[] }>>;
    }>();

    const protectedOps = Object.entries(doc.paths).flatMap(([path, ops]) =>
      Object.entries(ops)
        .filter(([, op]) => op.security?.length)
        .map(([method, _op]) => ({ method: method.toUpperCase(), path })),
    );

    assert.ok(
      protectedOps.length >= 25,
      `esperava >= 25 rotas protegidas, achou ${protectedOps.length}`,
    );

    const results = await Promise.all(
      protectedOps.map(async ({ method, path }) => {
        const url = path.replace(/\{[^}]+\}/g, randomUUID());
        const response = await ctx.request(null, { method: method as 'GET', url });

        return { route: `${method} ${path}`, status: response.statusCode };
      }),
    );

    assert.deepEqual(
      results.filter((result) => result.status !== 401),
      [],
      'rotas protegidas que nao responderam 401',
    );
  });

  it('refresh token usado como access token -> 401', async () => {
    const refreshLike = ctx.app.jwt.sign({ sub: owner.id, role: 'user', typ: 'refresh' });
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${refreshLike}` },
    });

    assert.equal(response.statusCode, 401);
  });

  it('token de usuario inexistente -> 401', async () => {
    const ghost = ctx.app.jwt.sign({ sub: randomUUID(), role: 'user', typ: 'access' });
    const response = await ctx.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${ghost}` },
    });

    assert.equal(response.statusCode, 401);
  });
});

describe('status da conta', () => {
  (['banned', 'inactive'] as const).forEach((status) => {
    it(`conta ${status} -> 403 em rota autenticada`, async () => {
      const user = await ctx.createUser({ status });
      const response = await ctx.request(user, { method: 'GET', url: '/workout-sheets' });

      assert.equal(response.statusCode, 403);
      assert.equal(response.json<{ error: { code: string } }>().error.code, 'FORBIDDEN');
    });
  });

  it('ban apos emissao do token derruba o token ainda valido', async () => {
    const user = await ctx.createUser();

    assert.equal((await ctx.request(user, { method: 'GET', url: '/auth/me' })).statusCode, 200);

    await prisma.user.update({ where: { id: user.id }, data: { status: 'banned' } });

    assert.equal((await ctx.request(user, { method: 'GET', url: '/auth/me' })).statusCode, 403);
  });
});

describe('roles', () => {
  it('hierarquia: super_user >= admin >= user', () => {
    assert.ok(hasRole('super_user', 'admin'));
    assert.ok(hasRole('admin', 'user'));
    assert.ok(hasRole('admin', 'admin'));
    assert.ok(!hasRole('user', 'admin'));
    assert.ok(!hasRole('admin', 'super_user'));
  });

  it('GET /media/:id: dono le, outro usuario recebe 404', async () => {
    const own = await ctx.request(owner, { method: 'GET', url: `/media/${res.mediaId}` });
    const other = await ctx.request(intruder, { method: 'GET', url: `/media/${res.mediaId}` });

    assert.equal(own.statusCode, 200);
    assert.equal(own.headers['content-type'], 'image/png');
    assert.equal(other.statusCode, 404);
  });

  it('GET /media/:id: admin e super_user leem midia de outro usuario', async () => {
    const responses = await Promise.all(
      [admin, superUser].map((privileged) =>
        ctx.request(privileged, { method: 'GET', url: `/media/${res.mediaId}` }),
      ),
    );

    assert.deepEqual(
      responses.map((response) => response.statusCode),
      [200, 200],
    );
  });

  it('admin NAO acessa planilha nem sessao de outro usuario (dados do usuario nao sao rota admin)', async () => {
    const sheet = await ctx.request(admin, {
      method: 'GET',
      url: `/workout-sheets/${res.sheetId}`,
    });
    const session = await ctx.request(superUser, {
      method: 'GET',
      url: `/workout-sessions/${res.sessionId}`,
    });

    assert.equal(sheet.statusCode, 404);
    assert.equal(session.statusCode, 404);
  });
});

describe('ownership: acesso direto por id', () => {
  const cases: [
    string,
    () => { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; url: string; payload?: object },
    number,
  ][] = [
    ['GET planilha', () => ({ method: 'GET', url: `/workout-sheets/${res.sheetId}` }), 404],
    [
      'PATCH planilha',
      () => ({ method: 'PATCH', url: `/workout-sheets/${res.sheetId}`, payload: { name: 'x' } }),
      404,
    ],
    ['DELETE planilha', () => ({ method: 'DELETE', url: `/workout-sheets/${res.sheetId}` }), 404],
    [
      'PATCH reorder planilha',
      () => ({
        method: 'PATCH',
        url: `/workout-sheets/${res.sheetId}/reorder`,
        payload: { dayId: res.dayId, exercises: [{ id: res.sheetExerciseId, sortOrder: 1 }] },
      }),
      404,
    ],
    ['GET sessao', () => ({ method: 'GET', url: `/workout-sessions/${res.sessionId}` }), 404],
    [
      'PATCH sessao',
      () => ({
        method: 'PATCH',
        url: `/workout-sessions/${res.sessionId}`,
        payload: { comment: 'x' },
      }),
      404,
    ],
    [
      'POST complete sessao',
      () => ({ method: 'POST', url: `/workout-sessions/${res.sessionId}/complete` }),
      404,
    ],
    [
      'POST foto sessao',
      () => ({
        method: 'POST',
        url: `/workout-sessions/${res.sessionId}/photo`,
        payload: { data: PNG_1X1_BASE64, mimeType: 'image/png' },
      }),
      404,
    ],
    ['GET atividade', () => ({ method: 'GET', url: `/activities/${res.activityId}` }), 404],
    [
      'PATCH atividade',
      () => ({
        method: 'PATCH',
        url: `/activities/${res.activityId}`,
        payload: { durationMinutes: 1 },
      }),
      404,
    ],
    ['DELETE atividade', () => ({ method: 'DELETE', url: `/activities/${res.activityId}` }), 404],
    [
      'POST foto atividade',
      () => ({
        method: 'POST',
        url: `/activities/${res.activityId}/photo`,
        payload: { data: PNG_1X1_BASE64, mimeType: 'image/png' },
      }),
      404,
    ],
    // Custom exercise responde 403 (nao 404) para dono errado — comportamento da 1.3, ver sdd/1.6
    [
      'PATCH custom exercise',
      () => ({
        method: 'PATCH',
        url: `/exercises/custom/${res.customExerciseId}`,
        payload: { name: 'x' },
      }),
      403,
    ],
    [
      'DELETE custom exercise',
      () => ({ method: 'DELETE', url: `/exercises/custom/${res.customExerciseId}` }),
      403,
    ],
  ];

  cases.forEach(([label, build, expected]) => {
    it(`${label} de outro usuario -> ${expected}`, async () => {
      const response = await ctx.request(intruder, build());

      assert.equal(response.statusCode, expected, response.body);
    });
  });

  it('nenhuma tentativa do intruso alterou os recursos do dono', async () => {
    const sheet = await ctx.request(owner, {
      method: 'GET',
      url: `/workout-sheets/${res.sheetId}`,
    });
    const session = await ctx.request(owner, {
      method: 'GET',
      url: `/workout-sessions/${res.sessionId}`,
    });
    const custom = await prisma.customExercise.findUniqueOrThrow({
      where: { id: res.customExerciseId },
    });

    assert.equal(sheet.statusCode, 200);
    assert.equal(sheet.json<{ name: string }>().name, 'Planilha do dono');
    assert.equal(
      session.json<{
        comment: string | null;
        completedAt: string | null;
        photoUrl: string | null;
      }>().completedAt,
      null,
    );
    assert.equal(session.json<{ photoUrl: string | null }>().photoUrl, null);
    assert.equal(custom.name, 'Exercicio do dono');
    assert.equal(custom.deletedAt, null);

    const activity = await ctx.request(owner, {
      method: 'GET',
      url: `/activities/${res.activityId}`,
    });

    assert.equal(activity.statusCode, 200);
    assert.deepEqual(
      [
        activity.json<{ durationMinutes: number }>().durationMinutes,
        activity.json<{ photoUrl: string | null }>().photoUrl,
      ],
      [30, null],
    );
  });
});

describe('ownership: referencias cruzadas', () => {
  it('planilha com custom exercise de outro usuario -> 400', async () => {
    const response = await ctx.request(intruder, {
      method: 'POST',
      url: '/workout-sheets',
      payload: {
        name: 'Roubo',
        days: [
          {
            weekday: 2,
            order: 0,
            exercises: [{ customExerciseId: res.customExerciseId, sortOrder: 0 }],
          },
        ],
      },
    });

    assert.equal(response.statusCode, 400);
  });

  it('sessao na planilha de outro usuario -> 400', async () => {
    const response = await ctx.request(intruder, {
      method: 'POST',
      url: '/workout-sessions',
      payload: sessionBody(res.sheetId, { exerciseId: catalogExerciseId }),
    });

    assert.equal(response.statusCode, 400);
  });

  it('sessao propria usando custom exercise de outro usuario -> 400', async () => {
    const ownSheet = await ctx.request(intruder, {
      method: 'POST',
      url: '/workout-sheets',
      payload: {
        name: 'Minha',
        days: [
          { weekday: 3, order: 0, exercises: [{ exerciseId: catalogExerciseId, sortOrder: 0 }] },
        ],
      },
    });
    const response = await ctx.request(intruder, {
      method: 'POST',
      url: '/workout-sessions',
      payload: sessionBody(ownSheet.json<{ id: string }>().id, {
        customExerciseId: res.customExerciseId,
      }),
    });

    assert.equal(response.statusCode, 400);
  });
});

describe('ownership: tipos de atividade', () => {
  it('atividade com tipo personalizado de outro usuario -> 400 (POST e PATCH)', async () => {
    const created = await ctx.request(intruder, {
      method: 'POST',
      url: '/activities',
      payload: { activityTypeId: res.activityTypeId, durationMinutes: 20 },
    });
    const ownTypes = await ctx.request(intruder, { method: 'GET', url: '/activity-types' });
    const own = await ctx.request(intruder, {
      method: 'POST',
      url: '/activities',
      payload: {
        activityTypeId: ownTypes.json<{ items: { id: string }[] }>().items[0]!.id,
        durationMinutes: 20,
      },
    });
    const patched = await ctx.request(intruder, {
      method: 'PATCH',
      url: `/activities/${own.json<{ id: string }>().id}`,
      payload: { activityTypeId: res.activityTypeId },
    });

    assert.equal(created.statusCode, 400);
    assert.equal(patched.statusCode, 400);
  });

  it('tipo personalizado de outro usuario nao bloqueia o mesmo nome', async () => {
    const response = await ctx.request(intruder, {
      method: 'POST',
      url: '/activity-types/custom',
      payload: { name: 'Tipo do dono' },
    });

    assert.equal(response.statusCode, 201);
  });
});

describe('ownership: listagens nao vazam dados', () => {
  it('GET /exercises nao inclui custom exercise de outro usuario', async () => {
    const { items } = (await ctx.request(intruder, { method: 'GET', url: '/exercises' })).json<{
      items: { id: string }[];
    }>();

    assert.ok(!items.some((item) => item.id === res.customExerciseId));
  });

  it('GET /workout-sheets nao inclui planilha de outro usuario', async () => {
    const { items } = (
      await ctx.request(intruder, { method: 'GET', url: '/workout-sheets' })
    ).json<{
      items: { id: string }[];
    }>();

    assert.ok(!items.some((item) => item.id === res.sheetId));
  });

  it('GET /workout-sessions (inclusive filtrando pelo sheetId do dono) vem vazio', async () => {
    const all = await ctx.request(intruder, { method: 'GET', url: '/workout-sessions' });
    const bySheet = await ctx.request(intruder, {
      method: 'GET',
      url: `/workout-sessions?sheetId=${res.sheetId}`,
    });

    assert.equal(all.json<{ total: number }>().total, 0);
    assert.equal(bySheet.json<{ total: number }>().total, 0);
  });

  it('GET /activity-types nao inclui tipo personalizado de outro usuario', async () => {
    const { items } = (
      await ctx.request(intruder, { method: 'GET', url: '/activity-types' })
    ).json<{
      items: { id: string }[];
    }>();

    assert.ok(!items.some((item) => item.id === res.activityTypeId));
  });

  it('GET /activities so traz as atividades do proprio usuario', async () => {
    const { items } = (await ctx.request(intruder, { method: 'GET', url: '/activities' })).json<{
      items: { id: string }[];
    }>();

    assert.ok(!items.some((item) => item.id === res.activityId));
  });

  it('GET /calendar e /calendar/:date so agregam registros do proprio usuario', async () => {
    // Sessao e atividade do dono foram criadas agora, entao caem em "hoje" no fuso padrao.
    // Usuario novo (e nao o intruso): o intruso registra atividade propria em outro teste.
    const stranger = await ctx.createUser();
    const today = todayIn('America/Sao_Paulo');
    const [year, month] = today.split('-');
    const query = `/calendar?year=${String(Number(year))}&month=${String(Number(month))}`;

    const [ownMonth, theirMonth, ownDay, theirDay] = await Promise.all([
      ctx.request(owner, { method: 'GET', url: query }),
      ctx.request(stranger, { method: 'GET', url: query }),
      ctx.request(owner, { method: 'GET', url: `/calendar/${today}` }),
      ctx.request(stranger, { method: 'GET', url: `/calendar/${today}` }),
    ]);

    assert.ok(ownMonth.json<{ days: unknown[] }>().days.length > 0);
    assert.deepEqual(theirMonth.json<{ days: unknown[] }>().days, []);
    assert.ok(ownDay.json<{ hasActivity: boolean }>().hasActivity);
    assert.deepEqual(
      [
        theirDay.json<{ workouts: unknown[] }>().workouts,
        theirDay.json<{ activities: unknown[] }>().activities,
      ],
      [[], []],
    );
  });

  it('GET /profile/measurements so traz o historico do proprio usuario', async () => {
    const mine = await ctx.request(owner, { method: 'GET', url: '/profile/measurements' });
    const theirs = await ctx.request(intruder, { method: 'GET', url: '/profile/measurements' });

    assert.equal(mine.json<{ total: number }>().total, 1);
    assert.equal(theirs.json<{ total: number }>().total, 0);
  });
});
