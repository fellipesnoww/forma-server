import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { prisma } from '../src/shared/db/client.js';
import { addDays, todayIn } from '../src/shared/time/index.js';
import {
  createTestContext,
  findCatalogExerciseId,
  type TestContext,
  type TestUser,
} from './helpers.js';

/**
 * `GET /stats/overview` (dashboard). As datas sao relativas a hoje no fuso padrao do perfil
 * (America/Sao_Paulo, UTC-3 sem horario de verao): o meio-dia local de um dia passado e
 * `<data>T15:00:00Z`.
 */

interface Overview {
  timezone: string;
  today: string;
  week: {
    from: string;
    to: string;
    volumeKg: number;
    previousVolumeKg: number;
    volumeChangePct: number | null;
    workoutCount: number;
    days: { date: string; weekday: number; volumeKg: number; workoutCount: number }[];
  };
  month: {
    year: number;
    month: number;
    workoutCount: number;
    plannedWorkoutCount: number;
    planCompletionPct: number | null;
    activityCount: number;
    activityMinutes: number;
    activityTypes: { activityTypeId: string; name: string; count: number; minutes: number }[];
  };
}

const TIMEZONE = 'America/Sao_Paulo';

let ctx: TestContext;
let catalogId: string;

function noonOf(date: string): string {
  return `${date}T15:00:00.000Z`;
}

async function createSheet(user: TestUser, weekdays: number[]): Promise<string> {
  const response = await ctx.request(user, {
    method: 'POST',
    url: '/workout-sheets',
    payload: {
      name: 'Planilha stats',
      days: weekdays.map((weekday, order) => ({
        weekday,
        order,
        exercises: [{ exerciseId: catalogId, sortOrder: 0 }],
      })),
    },
  });

  assert.equal(response.statusCode, 201, response.body);

  return response.json<{ id: string }>().id;
}

async function addSession(
  user: TestUser,
  sheetId: string,
  sets: { reps: number; weightKg: number }[],
  performedAt?: string,
): Promise<void> {
  const response = await ctx.request(user, {
    method: 'POST',
    url: '/workout-sessions',
    payload: {
      sheetId,
      ...(performedAt ? { performedAt } : {}),
      exercises: [
        {
          exerciseId: catalogId,
          sortOrder: 0,
          sets: sets.map((set, index) => ({ setNumber: index + 1, ...set })),
        },
      ],
    },
  });

  assert.equal(response.statusCode, 201, response.body);
}

async function addActivity(user: TestUser, slug: string, durationMinutes: number): Promise<void> {
  const type = await prisma.activityType.findUniqueOrThrow({ where: { slug } });
  const response = await ctx.request(user, {
    method: 'POST',
    url: '/activities',
    payload: { activityTypeId: type.id, durationMinutes },
  });

  assert.equal(response.statusCode, 201, response.body);
}

async function overview(user: TestUser): Promise<Overview> {
  const response = await ctx.request(user, { method: 'GET', url: '/stats/overview' });

  assert.equal(response.statusCode, 200, response.body);

  return response.json<Overview>();
}

/** Dias de treino planejados no mes de `today`, contados de forma independente do servico. */
function plannedDays(today: string, weekdays: number[]): number {
  const monthPrefix = today.slice(0, 7);
  let count = 0;

  for (let day = 1; day <= 31; day += 1) {
    const date = `${monthPrefix}-${String(day).padStart(2, '0')}`;
    const parsed = new Date(`${date}T00:00:00.000Z`);

    if (parsed.toISOString().startsWith(date)) {
      count += weekdays.filter((weekday) => weekday === parsed.getUTCDay()).length;
    }
  }

  return count;
}

before(async () => {
  ctx = await createTestContext();
  catalogId = await findCatalogExerciseId(ctx, await ctx.createUser());
});

after(async () => {
  await ctx.close();
});

describe('GET /stats/overview', () => {
  it('usuario sem historico: zeros, 7 dias e percentuais null', async () => {
    const user = await ctx.createUser();
    const today = todayIn(TIMEZONE);
    const body = await overview(user);

    assert.equal(body.timezone, TIMEZONE);
    assert.equal(body.today, today);
    assert.equal(body.week.from, addDays(today, -6));
    assert.equal(body.week.to, today);
    assert.deepEqual(
      body.week.days.map((day) => day.date),
      Array.from({ length: 7 }, (_, index) => addDays(today, index - 6)),
    );
    assert.ok(body.week.days.every((day) => day.volumeKg === 0 && day.workoutCount === 0));
    assert.equal(body.week.volumeKg, 0);
    assert.equal(body.week.volumeChangePct, null);
    assert.equal(body.month.workoutCount, 0);
    assert.equal(body.month.plannedWorkoutCount, 0);
    assert.equal(body.month.planCompletionPct, null);
    assert.deepEqual(body.month.activityTypes, []);
    assert.equal(body.month.year, Number(today.slice(0, 4)));
    assert.equal(body.month.month, Number(today.slice(5, 7)));
  });

  describe('com historico', () => {
    let user: TestUser;
    let body: Overview;
    let today: string;
    const sessionDates: string[] = [];

    before(async () => {
      user = await ctx.createUser();
      today = todayIn(TIMEZONE);

      // Duas planilhas ativas: seg+qua e seg (seg conta duas vezes); a removida nao conta
      const sheetId = await createSheet(user, [1, 3]);
      await createSheet(user, [1]);
      const removed = await createSheet(user, [5]);
      await ctx.request(user, { method: 'DELETE', url: `/workout-sheets/${removed}` });

      // Hoje: 10x50 + 8x60 = 980 kg
      await addSession(user, sheetId, [
        { reps: 10, weightKg: 50 },
        { reps: 8, weightKg: 60 },
      ]);
      sessionDates.push(today);
      // 2 dias atras: 5x100 = 500 kg
      await addSession(user, sheetId, [{ reps: 5, weightKg: 100 }], noonOf(addDays(today, -2)));
      sessionDates.push(addDays(today, -2));
      // 9 dias atras (semana anterior): 10x20 = 200 kg
      await addSession(user, sheetId, [{ reps: 10, weightKg: 20 }], noonOf(addDays(today, -9)));
      sessionDates.push(addDays(today, -9));
      // 20 dias atras: fora das duas janelas de 7 dias
      await addSession(user, sheetId, [{ reps: 1, weightKg: 999 }], noonOf(addDays(today, -20)));
      sessionDates.push(addDays(today, -20));

      await addActivity(user, 'corrida', 30);
      await addActivity(user, 'corrida', 20);
      await addActivity(user, 'natacao', 45);

      // Outro usuario no mesmo dia nao entra em nada
      const other = await ctx.createUser();
      await addSession(other, await createSheet(other, [1]), [{ reps: 10, weightKg: 500 }]);
      await addActivity(other, 'futebol', 90);

      body = await overview(user);
    });

    it('volume da semana, semana anterior e variacao %', () => {
      assert.equal(body.week.volumeKg, 1480);
      assert.equal(body.week.previousVolumeKg, 200);
      assert.equal(body.week.volumeChangePct, 640);
      assert.equal(body.week.workoutCount, 2);
    });

    it('volume por dia nos ultimos 7 dias, hoje por ultimo', () => {
      const byDate = new Map(body.week.days.map((day) => [day.date, day]));

      assert.equal(body.week.days.length, 7);
      assert.deepEqual(byDate.get(today), {
        date: today,
        weekday: new Date(`${today}T00:00:00Z`).getUTCDay(),
        volumeKg: 980,
        workoutCount: 1,
      });
      assert.equal(byDate.get(addDays(today, -2))?.volumeKg, 500);
      assert.equal(
        body.week.days.reduce((total, day) => total + day.workoutCount, 0),
        2,
      );
    });

    it('treinos do mes contra o planejado pelas planilhas ativas', () => {
      const monthPrefix = today.slice(0, 7);
      const expectedWorkouts = sessionDates.filter((date) => date.startsWith(monthPrefix)).length;
      const expectedPlanned = plannedDays(today, [1, 3, 1]);

      assert.equal(body.month.workoutCount, expectedWorkouts);
      assert.equal(body.month.plannedWorkoutCount, expectedPlanned);
      assert.equal(
        body.month.planCompletionPct,
        Math.round((expectedWorkouts / expectedPlanned) * 100),
      );
    });

    it('atividades do mes por tipo, mais frequente primeiro', () => {
      assert.equal(body.month.activityCount, 3);
      assert.equal(body.month.activityMinutes, 95);
      assert.deepEqual(
        body.month.activityTypes.map(({ name, count, minutes }) => ({ name, count, minutes })),
        [
          { name: 'Corrida', count: 2, minutes: 50 },
          { name: 'Natação', count: 1, minutes: 45 },
        ],
      );
    });
  });

  it('sem token -> 401', async () => {
    const response = await ctx.request(null, { method: 'GET', url: '/stats/overview' });

    assert.equal(response.statusCode, 401);
  });
});
