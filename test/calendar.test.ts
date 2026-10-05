import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  PNG_1X1_BASE64,
  createTestContext,
  findCatalogExerciseId,
  type TestContext,
  type TestUser,
} from './helpers.js';

/**
 * Regras da 2.2 (calendario) e o lado "meia-noite e fuso" da 2.3. O fuso padrao do perfil e
 * America/Sao_Paulo (UTC-3, sem horario de verao desde 2019), entao 02:30Z ainda e o dia
 * anterior no calendario do usuario.
 */

interface CalendarDay {
  date: string;
  hasWorkout: boolean;
  hasActivity: boolean;
  photoUrls: string[];
  summary: { workoutCount: number; activityCount: number; activityMinutes: number };
}

interface CalendarMonth {
  year: number;
  month: number;
  timezone: string;
  photoLimit: number;
  days: CalendarDay[];
}

interface CalendarDayDetail {
  date: string;
  timezone: string;
  hasWorkout: boolean;
  hasActivity: boolean;
  summary: CalendarDay['summary'];
  workouts: {
    id: string;
    performedAt: string;
    sheetName: string;
    exerciseCount: number;
    setCount: number;
    durationMinutes: number | null;
  }[];
  activities: { id: string; performedAt: string; durationMinutes: number }[];
}

let ctx: TestContext;
let catalogId: string;
let typeId: string;

async function setup(user: TestUser): Promise<string> {
  const sheet = await ctx.request(user, {
    method: 'POST',
    url: '/workout-sheets',
    payload: {
      name: 'Planilha calendario',
      days: [{ weekday: 1, order: 0, exercises: [{ exerciseId: catalogId, sortOrder: 0 }] }],
    },
  });

  return sheet.json<{ id: string }>().id;
}

async function addSession(user: TestUser, sheetId: string, performedAt: string): Promise<string> {
  const response = await ctx.request(user, {
    method: 'POST',
    url: '/workout-sessions',
    payload: {
      sheetId,
      performedAt,
      exercises: [
        { exerciseId: catalogId, sortOrder: 0, sets: [{ setNumber: 1, reps: 10, weightKg: 20 }] },
      ],
    },
  });

  assert.equal(response.statusCode, 201, response.body);

  return response.json<{ id: string }>().id;
}

async function addActivity(
  user: TestUser,
  performedAt: string,
  durationMinutes = 30,
): Promise<string> {
  const response = await ctx.request(user, {
    method: 'POST',
    url: '/activities',
    payload: { activityTypeId: typeId, performedAt, durationMinutes },
  });

  assert.equal(response.statusCode, 201, response.body);

  return response.json<{ id: string }>().id;
}

async function addPhoto(user: TestUser, url: string): Promise<string> {
  const response = await ctx.request(user, {
    method: 'POST',
    url,
    payload: { data: PNG_1X1_BASE64, mimeType: 'image/png' },
  });

  return response.json<{ photoUrl: string }>().photoUrl;
}

function month(user: TestUser, query: string) {
  return ctx.request(user, { method: 'GET', url: `/calendar${query}` });
}

function day(user: TestUser, date: string) {
  return ctx.request(user, { method: 'GET', url: `/calendar/${date}` });
}

function assertValidationError(response: { statusCode: number; body: string }): void {
  assert.equal(response.statusCode, 400, response.body);
  assert.equal(JSON.parse(response.body).error.code as string, 'VALIDATION_ERROR');
}

before(async () => {
  ctx = await createTestContext();

  const bootstrap = await ctx.createUser();

  catalogId = await findCatalogExerciseId(ctx, bootstrap);
  typeId = (await ctx.request(bootstrap, { method: 'GET', url: '/activity-types' })).json<{
    items: { id: string }[];
  }>().items[0]!.id;
});

after(async () => {
  await ctx.close();
});

describe('timezone do perfil', () => {
  it('default America/Sao_Paulo; PATCH aceita IANA valido', async () => {
    const user = await ctx.createUser();
    const initial = await ctx.request(user, { method: 'GET', url: '/profile' });
    const patched = await ctx.request(user, {
      method: 'PATCH',
      url: '/profile',
      payload: { timezone: 'Europe/Lisbon' },
    });

    assert.equal(initial.json<{ timezone: string }>().timezone, 'America/Sao_Paulo');
    assert.equal(patched.statusCode, 200, patched.body);
    assert.equal(patched.json<{ timezone: string }>().timezone, 'Europe/Lisbon');
  });

  ['Brasil/Sao_Paulo', 'GMT-3', ''].forEach((timezone) => {
    it(`fuso invalido '${timezone}' -> 400`, async () => {
      const user = await ctx.createUser();

      assertValidationError(
        await ctx.request(user, { method: 'PATCH', url: '/profile', payload: { timezone } }),
      );
    });
  });
});

describe('GET /calendar (mes)', () => {
  let user: TestUser;
  let sessionPhoto: string;
  let activityPhotos: string[];

  before(async () => {
    user = await ctx.createUser();

    const sheetId = await setup(user);
    const sessionId = await addSession(user, sheetId, '2025-03-10T12:00:00.000Z');

    await addActivity(user, '2025-03-10T15:00:00.000Z', 45);
    // 23:30 de 10/03 em Sao Paulo
    await addActivity(user, '2025-03-11T02:30:00.000Z', 20);
    // 23:00 de 28/02 em Sao Paulo: fica fora de marco
    await addActivity(user, '2025-03-01T02:00:00.000Z');
    // 23:00 de 31/03 em Sao Paulo: entra em marco
    await addActivity(user, '2025-04-01T02:00:00.000Z');

    sessionPhoto = await addPhoto(user, `/workout-sessions/${sessionId}/photo`);

    // Dia 20 com 4 fotos: limite de 3 miniaturas
    const photoDay = await Promise.all(
      ['08', '09', '10', '11'].map((hour) => addActivity(user, `2025-03-20T${hour}:00:00.000Z`)),
    );

    activityPhotos = [];
    // Sequencial: a ordem de upload nao importa, mas evita 4 uploads simultaneos
    await photoDay.reduce(
      (chain, id) =>
        chain.then(async () => {
          activityPhotos.push(await addPhoto(user, `/activities/${id}/photo`));
        }),
      Promise.resolve(),
    );
  });

  it('agrupa por dia local e so lista dias com registro', async () => {
    const body = (await month(user, '?year=2025&month=3')).json<CalendarMonth>();

    assert.deepEqual(
      [body.year, body.month, body.timezone, body.photoLimit],
      [2025, 3, 'America/Sao_Paulo', 3],
    );
    assert.deepEqual(
      body.days.map((entry) => entry.date),
      ['2025-03-10', '2025-03-20', '2025-03-31'],
    );
  });

  it('flags e summary do dia combinam treino e atividades', async () => {
    const { days } = (await month(user, '?year=2025&month=3')).json<CalendarMonth>();
    const tenth = days.find((entry) => entry.date === '2025-03-10')!;
    const last = days.find((entry) => entry.date === '2025-03-31')!;

    assert.deepEqual(
      [tenth.hasWorkout, tenth.hasActivity, tenth.summary],
      [true, true, { workoutCount: 1, activityCount: 2, activityMinutes: 65 }],
    );
    assert.deepEqual([last.hasWorkout, last.hasActivity], [false, true]);
    assert.deepEqual(tenth.photoUrls, [sessionPhoto]);
  });

  it('limita miniaturas por dia, mais antigas primeiro', async () => {
    const { days } = (await month(user, '?year=2025&month=3')).json<CalendarMonth>();
    const twentieth = days.find((entry) => entry.date === '2025-03-20')!;

    assert.equal(twentieth.summary.activityCount, 4);
    assert.deepEqual(twentieth.photoUrls, activityPhotos.slice(0, 3));
  });

  it('registro das 23h locais do ultimo dia do mes anterior aparece em fevereiro', async () => {
    const { days } = (await month(user, '?year=2025&month=2')).json<CalendarMonth>();

    assert.deepEqual(
      days.map((entry) => entry.date),
      ['2025-02-28'],
    );
  });

  it('mes sem registros -> days vazio', async () => {
    const { days } = (await month(user, '?year=2024&month=7')).json<CalendarMonth>();

    assert.deepEqual(days, []);
  });

  it('trocar o fuso do perfil muda o dia de cada registro', async () => {
    const utcUser = await ctx.createUser();

    await ctx.request(utcUser, { method: 'PATCH', url: '/profile', payload: { timezone: 'UTC' } });
    await addActivity(utcUser, '2025-03-11T02:30:00.000Z');

    const { days, timezone } = (await month(utcUser, '?year=2025&month=3')).json<CalendarMonth>();

    assert.equal(timezone, 'UTC');
    assert.deepEqual(
      days.map((entry) => entry.date),
      ['2025-03-11'],
    );
  });

  const invalid = ['', '?year=2025', '?month=3', '?year=2025&month=13', '?year=2025&month=0'];

  invalid.forEach((query) => {
    it(`query invalida '${query}' -> 400`, async () => {
      assertValidationError(await month(user, query));
    });
  });
});

describe('GET /calendar/:date (dia)', () => {
  let user: TestUser;
  let sheetId: string;

  before(async () => {
    user = await ctx.createUser();
    sheetId = await setup(user);
  });

  it('traz sessoes e atividades do dia local, em ordem de performedAt', async () => {
    await addActivity(user, '2025-06-05T02:59:00.000Z', 10); // 04/06 23:59 local
    await addActivity(user, '2025-06-05T03:00:00.000Z', 40); // 05/06 00:00 local
    await addSession(user, sheetId, '2025-06-05T21:00:00.000Z');
    await addActivity(user, '2025-06-06T02:00:00.000Z', 15); // 05/06 23:00 local
    await addActivity(user, '2025-06-06T03:00:00.000Z', 5); // 06/06 00:00 local

    const detail = (await day(user, '2025-06-05')).json<CalendarDayDetail>();

    assert.equal(detail.timezone, 'America/Sao_Paulo');
    assert.deepEqual(
      detail.activities.map((activity) => activity.performedAt),
      ['2025-06-05T03:00:00.000Z', '2025-06-06T02:00:00.000Z'],
    );
    assert.deepEqual(
      detail.workouts.map((workout) => workout.performedAt),
      ['2025-06-05T21:00:00.000Z'],
    );
    assert.deepEqual(detail.summary, { workoutCount: 1, activityCount: 2, activityMinutes: 55 });
    assert.equal(detail.workouts[0]!.sheetName, 'Planilha calendario');
    // Resumo da sessao no detalhe do dia: "N exercicios · M series" sem abrir cada sessao
    assert.equal(detail.workouts[0]!.exerciseCount, 1);
    assert.equal(detail.workouts[0]!.setCount, 1);
    assert.equal(detail.workouts[0]!.durationMinutes, null);
  });

  it('dia com registros bate com a agregacao mensal do mesmo dia', async () => {
    const detail = (await day(user, '2025-06-05')).json<CalendarDayDetail>();
    const { days } = (await month(user, '?year=2025&month=6')).json<CalendarMonth>();

    assert.deepEqual(days.find((entry) => entry.date === '2025-06-05')!.summary, detail.summary);
  });

  it('dia sem registro -> 200 com listas vazias', async () => {
    const response = await day(user, '2025-06-20');
    const detail = response.json<CalendarDayDetail>();

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      [detail.hasWorkout, detail.hasActivity, detail.workouts, detail.activities],
      [false, false, [], []],
    );
  });

  ['2025-02-30', '2025-6-5', 'ontem', '05-06-2025'].forEach((date) => {
    it(`data invalida '${date}' -> 400`, async () => {
      assertValidationError(await day(user, date));
    });
  });
});
