import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { prisma } from '../src/shared/db/client.js';
import { todayIn } from '../src/shared/time/index.js';
import {
  createTestContext,
  findCatalogExerciseId,
  type TestContext,
  type TestUser,
} from './helpers.js';

/** Regras da 2.4 (progressao). Perfil no fuso padrao America/Sao_Paulo (UTC-3). */

interface LoadPoint {
  date: string;
  maxWeightKg: number;
  volumeKg: number;
  totalReps: number;
  setCount: number;
}

interface LoadResponse {
  exerciseId: string | null;
  customExerciseId: string | null;
  timezone: string;
  from: string;
  to: string;
  points: LoadPoint[];
}

interface MeasurementsResponse {
  metric: string;
  unit: string;
  from: string;
  to: string;
  points: { measuredAt: string; value: number }[];
}

type SetTuple = [reps: number, weightKg: number];

const DAY_MS = 24 * 60 * 60 * 1000;

let ctx: TestContext;
let user: TestUser;
let sheetId: string;
let catalogId: string;
let otherCatalogId: string;
let customId: string;

async function addSession(
  performedAt: string,
  exercises: { ref: object; sets: SetTuple[] }[],
  as: TestUser = user,
  sheet = sheetId,
): Promise<void> {
  const response = await ctx.request(as, {
    method: 'POST',
    url: '/workout-sessions',
    payload: {
      sheetId: sheet,
      performedAt,
      exercises: exercises.map((exercise, index) => ({
        ...exercise.ref,
        sortOrder: index,
        sets: exercise.sets.map(([reps, weightKg], setIndex) => ({
          setNumber: setIndex + 1,
          reps,
          weightKg,
        })),
      })),
    },
  });

  assert.equal(response.statusCode, 201, response.body);
}

function load(query: string, as: TestUser = user) {
  return ctx.request(as, { method: 'GET', url: `/progress/load${query}` });
}

function measurements(query: string, as: TestUser = user) {
  return ctx.request(as, { method: 'GET', url: `/progress/measurements${query}` });
}

function assertValidationError(response: { statusCode: number; body: string }): void {
  assert.equal(response.statusCode, 400, response.body);
  assert.equal(JSON.parse(response.body).error.code as string, 'VALIDATION_ERROR');
}

before(async () => {
  ctx = await createTestContext();
  user = await ctx.createUser();

  const { items } = (await ctx.request(user, { method: 'GET', url: '/exercises' })).json<{
    items: { id: string; source: string }[];
  }>();

  catalogId = await findCatalogExerciseId(ctx, user);
  otherCatalogId = items.filter((item) => item.source === 'catalog')[1]!.id;
  customId = (
    await ctx.request(user, {
      method: 'POST',
      url: '/exercises/custom',
      payload: { name: 'Supino caseiro' },
    })
  ).json<{ id: string }>().id;
  sheetId = (
    await ctx.request(user, {
      method: 'POST',
      url: '/workout-sheets',
      payload: {
        name: 'Progressao',
        days: [{ weekday: 1, order: 0, exercises: [{ exerciseId: catalogId, sortOrder: 0 }] }],
      },
    })
  ).json<{ id: string }>().id;

  const catalog = { exerciseId: catalogId };
  const other = { exerciseId: otherCatalogId };

  await addSession('2025-05-01T12:00:00.000Z', [
    {
      ref: catalog,
      sets: [
        [10, 20],
        [8, 22.5],
      ],
    },
    { ref: other, sets: [[5, 100]] },
  ]);
  await addSession('2025-05-01T18:00:00.000Z', [{ ref: catalog, sets: [[5, 30]] }]);
  // 01:00Z de 03/05 = 22:00 de 02/05 em Sao Paulo
  await addSession('2025-05-03T01:00:00.000Z', [{ ref: catalog, sets: [[12, 0]] }]);
  await addSession('2025-05-10T12:00:00.000Z', [
    { ref: { customExerciseId: customId }, sets: [[6, 15]] },
  ]);
});

after(async () => {
  await ctx.close();
});

describe('GET /progress/load', () => {
  it('agrega todas as series do exercicio por dia local', async () => {
    const body = (
      await load(`?exerciseId=${catalogId}&from=2025-05-01&to=2025-05-31`)
    ).json<LoadResponse>();

    assert.deepEqual(
      [body.exerciseId, body.customExerciseId, body.timezone, body.from, body.to],
      [catalogId, null, 'America/Sao_Paulo', '2025-05-01', '2025-05-31'],
    );
    assert.deepEqual(body.points, [
      // 10x20 + 8x22.5 + 5x30, de duas sessoes no mesmo dia
      { date: '2025-05-01', maxWeightKg: 30, volumeKg: 530, totalReps: 23, setCount: 3 },
      // registro das 22h locais cai no dia 02, peso corporal = volume 0
      { date: '2025-05-02', maxWeightKg: 0, volumeKg: 0, totalReps: 12, setCount: 1 },
    ]);
  });

  it('outro exercicio da mesma sessao nao entra', async () => {
    const { points } = (
      await load(`?exerciseId=${otherCatalogId}&from=2025-05-01&to=2025-05-31`)
    ).json<LoadResponse>();

    assert.deepEqual(
      points.map((point) => [point.date, point.maxWeightKg]),
      [['2025-05-01', 100]],
    );
  });

  it('aceita customExerciseId', async () => {
    const body = (
      await load(`?customExerciseId=${customId}&from=2025-05-01&to=2025-05-31`)
    ).json<LoadResponse>();

    assert.deepEqual([body.exerciseId, body.customExerciseId], [null, customId]);
    assert.deepEqual(
      body.points.map((point) => [point.date, point.volumeKg]),
      [['2025-05-10', 90]],
    );
  });

  it('from/to sao datas locais inclusivas', async () => {
    const { points } = (
      await load(`?exerciseId=${catalogId}&from=2025-05-02&to=2025-05-02`)
    ).json<LoadResponse>();

    assert.deepEqual(
      points.map((point) => point.date),
      ['2025-05-02'],
    );
  });

  it('period: ultimos N dias incluindo hoje; default 90', async () => {
    await addSession(new Date().toISOString(), [
      { ref: { exerciseId: catalogId }, sets: [[1, 50]] },
    ]);
    await addSession(new Date(Date.now() - 45 * DAY_MS).toISOString(), [
      { ref: { exerciseId: catalogId }, sets: [[1, 40]] },
    ]);

    const today = todayIn('America/Sao_Paulo');
    const p30 = (await load(`?exerciseId=${catalogId}&period=30`)).json<LoadResponse>();
    const p60 = (await load(`?exerciseId=${catalogId}&period=60`)).json<LoadResponse>();
    const fallback = (await load(`?exerciseId=${catalogId}`)).json<LoadResponse>();

    assert.equal(p30.to, today);
    assert.deepEqual(
      p30.points.map((point) => point.maxWeightKg),
      [50],
    );
    assert.deepEqual(
      p60.points.map((point) => point.maxWeightKg),
      [40, 50],
    );
    assert.equal(fallback.points.length, 2, 'default 90 dias nao alcanca maio de 2025');
  });

  it('exercicio sem historico -> 200 com points vazio', async () => {
    const response = await load(
      '?exerciseId=00000000-0000-4000-8000-000000000000&from=2025-01-01&to=2025-12-31',
    );

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json<LoadResponse>().points, []);
  });

  it('nao soma series de outro usuario no mesmo exercicio', async () => {
    const other = await ctx.createUser();
    const otherSheet = (
      await ctx.request(other, {
        method: 'POST',
        url: '/workout-sheets',
        payload: {
          name: 'Outro',
          days: [{ weekday: 2, order: 0, exercises: [{ exerciseId: catalogId, sortOrder: 0 }] }],
        },
      })
    ).json<{ id: string }>().id;

    await addSession(
      '2025-05-01T12:00:00.000Z',
      [{ ref: { exerciseId: catalogId }, sets: [[1, 999]] }],
      other,
      otherSheet,
    );

    const { points } = (
      await load(`?exerciseId=${catalogId}&from=2025-05-01&to=2025-05-01`)
    ).json<LoadResponse>();

    assert.equal(points[0]!.maxWeightKg, 30);
  });

  const invalid: [string, () => string][] = [
    ['sem exercicio', () => '?period=30'],
    [
      'exerciseId e customExerciseId',
      () => `?exerciseId=${catalogId}&customExerciseId=${customId}`,
    ],
    ['period fora da lista', () => `?exerciseId=${catalogId}&period=45`],
    [
      'period com from/to',
      () => `?exerciseId=${catalogId}&period=30&from=2025-01-01&to=2025-01-31`,
    ],
    ['from sem to', () => `?exerciseId=${catalogId}&from=2025-01-01`],
    ['from depois de to', () => `?exerciseId=${catalogId}&from=2025-02-01&to=2025-01-01`],
    ['data invalida', () => `?exerciseId=${catalogId}&from=2025-02-30&to=2025-03-01`],
    ['intervalo acima de 3 anos', () => `?exerciseId=${catalogId}&from=2020-01-01&to=2025-01-01`],
  ];

  invalid.forEach(([label, query]) => {
    it(`${label} -> 400`, async () => {
      assertValidationError(await load(query()));
    });
  });
});

describe('GET /progress/measurements', () => {
  let measured: TestUser;

  before(async () => {
    measured = await ctx.createUser();
    // createdAt nao e aceito pela API (historico append-only com data do servidor), entao o
    // historico antigo entra direto no banco
    await prisma.bodyMeasurement.createMany({
      data: [
        {
          userId: measured.id,
          weightKg: 82,
          waistCm: 90,
          createdAt: new Date('2025-01-05T12:00:00Z'),
        },
        { userId: measured.id, weightKg: 80.5, createdAt: new Date('2025-02-05T12:00:00Z') },
        { userId: measured.id, waistCm: 87, createdAt: new Date('2025-03-05T12:00:00Z') },
      ],
    });
  });

  it('pontos em ordem cronologica, so registros com a metrica', async () => {
    const weight = (
      await measurements('?metric=weight&from=2025-01-01&to=2025-12-31', measured)
    ).json<MeasurementsResponse>();
    const waist = (
      await measurements('?metric=waist&from=2025-01-01&to=2025-12-31', measured)
    ).json<MeasurementsResponse>();

    assert.deepEqual([weight.unit, waist.unit], ['kg', 'cm']);
    assert.deepEqual(weight.points, [
      { measuredAt: '2025-01-05T12:00:00.000Z', value: 82 },
      { measuredAt: '2025-02-05T12:00:00.000Z', value: 80.5 },
    ]);
    assert.deepEqual(
      waist.points.map((point) => point.value),
      [90, 87],
    );
  });

  it('intervalo filtra por createdAt', async () => {
    const { points } = (
      await measurements('?metric=weight&from=2025-02-01&to=2025-02-28', measured)
    ).json<MeasurementsResponse>();

    assert.deepEqual(
      points.map((point) => point.value),
      [80.5],
    );
  });

  it('medida registrada agora entra no periodo padrao', async () => {
    await ctx.request(measured, {
      method: 'POST',
      url: '/profile/measurements',
      payload: { chestCm: 101 },
    });

    const { points } = (await measurements('?metric=chest', measured)).json<MeasurementsResponse>();

    assert.deepEqual(
      points.map((point) => point.value),
      [101],
    );
  });

  it('nao traz medidas de outro usuario', async () => {
    const { points } = (
      await measurements('?metric=weight&from=2025-01-01&to=2025-12-31')
    ).json<MeasurementsResponse>();

    assert.deepEqual(points, []);
  });

  ['?from=2025-01-01&to=2025-01-31', '?metric=bmi', '?metric=weight&period=7'].forEach((query) => {
    it(`query invalida '${query}' -> 400`, async () => {
      assertValidationError(await measurements(query, measured));
    });
  });
});
