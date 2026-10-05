import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import {
  createTestContext,
  findCatalogExerciseId,
  type TestContext,
  type TestUser,
} from './helpers.js';

/**
 * Regras de negocio da 5.1: `GET /exercises/:id/last-session`, `POST /workout-sheets/:id/duplicate`
 * e o campo `defaultRestSeconds` dos exercicios da planilha.
 */

interface SetInput {
  setNumber: number;
  reps: number;
  weightKg: number;
  completed?: boolean;
}

interface LastSessionResponse {
  exerciseId: string | null;
  customExerciseId: string | null;
  name: string;
  lastSession: {
    sessionId: string;
    sheetId: string;
    sheetName: string;
    performedAt: string;
    completedAt: string | null;
    sets: Required<SetInput>[];
    suggestion: { weightKg: number; reps: number };
  } | null;
}

interface SheetDetail {
  id: string;
  name: string;
  days: {
    id: string;
    weekday: number;
    order: number;
    exercises: {
      id: string;
      exerciseId: string | null;
      customExerciseId: string | null;
      sortOrder: number;
      targetSets: number | null;
      targetReps: number | null;
      defaultRestSeconds: number | null;
    }[];
  }[];
}

let ctx: TestContext;
let user: TestUser;
let other: TestUser;
let catalogId: string;
let secondCatalogId: string;

async function createCustomExercise(owner: TestUser, name: string): Promise<string> {
  const response = await ctx.request(owner, {
    method: 'POST',
    url: '/exercises/custom',
    payload: { name },
  });

  assert.equal(response.statusCode, 201, response.body);

  return response.json<{ id: string }>().id;
}

async function createSheet(owner: TestUser, payload: object): Promise<SheetDetail> {
  const response = await ctx.request(owner, { method: 'POST', url: '/workout-sheets', payload });

  assert.equal(response.statusCode, 201, response.body);

  return response.json<SheetDetail>();
}

async function simpleSheet(owner: TestUser): Promise<string> {
  const sheet = await createSheet(owner, {
    name: 'Planilha',
    days: [{ weekday: 1, order: 0, exercises: [{ exerciseId: catalogId, sortOrder: 0 }] }],
  });

  return sheet.id;
}

async function createSession(
  owner: TestUser,
  sheetId: string,
  exercises: { ref: object; sets: SetInput[] }[],
  performedAt?: string,
): Promise<string> {
  const response = await ctx.request(owner, {
    method: 'POST',
    url: '/workout-sessions',
    payload: {
      sheetId,
      ...(performedAt ? { performedAt } : {}),
      exercises: exercises.map((item, index) => ({
        ...item.ref,
        sortOrder: index,
        sets: item.sets,
      })),
    },
  });

  assert.equal(response.statusCode, 201, response.body);

  return response.json<{ id: string }>().id;
}

function getLastSession(owner: TestUser | null, id: string, query = '') {
  return ctx.request(owner, { method: 'GET', url: `/exercises/${id}/last-session${query}` });
}

async function lastSession(owner: TestUser, id: string, query = ''): Promise<LastSessionResponse> {
  const response = await getLastSession(owner, id, query);

  assert.equal(response.statusCode, 200, response.body);

  return response.json<LastSessionResponse>();
}

function duplicate(owner: TestUser, id: string, payload?: object) {
  return ctx.request(owner, {
    method: 'POST',
    url: `/workout-sheets/${id}/duplicate`,
    ...(payload ? { payload } : {}),
  });
}

before(async () => {
  ctx = await createTestContext();
  [user, other] = await Promise.all([ctx.createUser(), ctx.createUser()]);
  catalogId = await findCatalogExerciseId(ctx, user);

  const { items } = (await ctx.request(user, { method: 'GET', url: '/exercises' })).json<{
    items: { id: string; source: string }[];
  }>();
  secondCatalogId = items.filter((item) => item.source === 'catalog')[1]!.id;
});

after(async () => {
  await ctx.close();
});

describe('GET /exercises/:id/last-session', () => {
  it('sem historico: 200 com lastSession null e nome do exercicio', async () => {
    const fresh = await ctx.createUser();
    const body = await lastSession(fresh, catalogId);

    assert.equal(body.exerciseId, catalogId);
    assert.equal(body.customExerciseId, null);
    assert.ok(body.name.length > 0);
    assert.equal(body.lastSession, null);
  });

  it('devolve a sessao mais recente por performedAt, nao a criada por ultimo', async () => {
    const owner = await ctx.createUser();
    const sheetId = await simpleSheet(owner);
    const recent = await createSession(
      owner,
      sheetId,
      [{ ref: { exerciseId: catalogId }, sets: [{ setNumber: 1, reps: 8, weightKg: 50 }] }],
      '2026-09-20T10:00:00.000Z',
    );
    // Registro retroativo criado depois, mas mais antigo
    await createSession(
      owner,
      sheetId,
      [{ ref: { exerciseId: catalogId }, sets: [{ setNumber: 1, reps: 10, weightKg: 40 }] }],
      '2026-09-01T10:00:00.000Z',
    );

    const body = await lastSession(owner, catalogId);

    assert.equal(body.lastSession?.sessionId, recent);
    assert.equal(body.lastSession.sheetId, sheetId);
    assert.equal(body.lastSession.sheetName, 'Planilha');
    assert.equal(body.lastSession.performedAt, '2026-09-20T10:00:00.000Z');
    assert.equal(body.lastSession.completedAt, null);
    assert.deepEqual(body.lastSession.sets, [
      { setNumber: 1, reps: 8, weightKg: 50, completed: false },
    ]);
  });

  it('series em ordem e sugestao = serie mais pesada (desempate: mais reps)', async () => {
    const owner = await ctx.createUser();
    const sheetId = await simpleSheet(owner);
    await createSession(owner, sheetId, [
      {
        ref: { exerciseId: catalogId },
        sets: [
          { setNumber: 3, reps: 6, weightKg: 60 },
          { setNumber: 1, reps: 10, weightKg: 50 },
          { setNumber: 2, reps: 8, weightKg: 60, completed: true },
        ],
      },
    ]);

    const body = await lastSession(owner, catalogId);

    assert.deepEqual(
      body.lastSession?.sets.map((set) => set.setNumber),
      [1, 2, 3],
    );
    assert.deepEqual(body.lastSession.suggestion, { weightKg: 60, reps: 8 });
  });

  it('ignora outros exercicios da sessao e sessoes sem o exercicio', async () => {
    const owner = await ctx.createUser();
    const sheetId = await simpleSheet(owner);
    const withExercise = await createSession(
      owner,
      sheetId,
      [{ ref: { exerciseId: catalogId }, sets: [{ setNumber: 1, reps: 5, weightKg: 30 }] }],
      '2026-09-10T10:00:00.000Z',
    );
    await createSession(
      owner,
      sheetId,
      [{ ref: { exerciseId: secondCatalogId }, sets: [{ setNumber: 1, reps: 5, weightKg: 99 }] }],
      '2026-09-15T10:00:00.000Z',
    );

    const body = await lastSession(owner, catalogId);

    assert.equal(body.lastSession?.sessionId, withExercise);
    assert.equal(body.lastSession.suggestion.weightKg, 30);
  });

  it('excludeSessionId ignora a sessao em andamento', async () => {
    const owner = await ctx.createUser();
    const sheetId = await simpleSheet(owner);
    const previous = await createSession(
      owner,
      sheetId,
      [{ ref: { exerciseId: catalogId }, sets: [{ setNumber: 1, reps: 10, weightKg: 45 }] }],
      '2026-09-01T10:00:00.000Z',
    );
    const current = await createSession(owner, sheetId, [
      { ref: { exerciseId: catalogId }, sets: [{ setNumber: 1, reps: 1, weightKg: 1 }] },
    ]);

    assert.equal((await lastSession(owner, catalogId)).lastSession?.sessionId, current);
    assert.equal(
      (await lastSession(owner, catalogId, `?excludeSessionId=${current}`)).lastSession?.sessionId,
      previous,
    );
  });

  it('sessoes de outro usuario nao entram', async () => {
    const owner = await ctx.createUser();
    const intruder = await ctx.createUser();
    await createSession(intruder, await simpleSheet(intruder), [
      { ref: { exerciseId: catalogId }, sets: [{ setNumber: 1, reps: 1, weightKg: 200 }] },
    ]);

    assert.equal((await lastSession(owner, catalogId)).lastSession, null);
  });

  it('aceita custom exercise do usuario, inclusive depois de removido', async () => {
    const owner = await ctx.createUser();
    const customId = await createCustomExercise(owner, 'Remada curvada unilateral');
    const sessionId = await createSession(owner, await simpleSheet(owner), [
      { ref: { customExerciseId: customId }, sets: [{ setNumber: 1, reps: 12, weightKg: 22 }] },
    ]);

    const removed = await ctx.request(owner, {
      method: 'DELETE',
      url: `/exercises/custom/${customId}`,
    });
    assert.equal(removed.statusCode, 204);

    const body = await lastSession(owner, customId);

    assert.equal(body.exerciseId, null);
    assert.equal(body.customExerciseId, customId);
    assert.equal(body.name, 'Remada curvada unilateral');
    assert.equal(body.lastSession?.sessionId, sessionId);
  });

  it('custom exercise de outro usuario ou id inexistente: 404', async () => {
    const customId = await createCustomExercise(other, 'Exercicio alheio');

    assert.equal((await getLastSession(user, customId)).statusCode, 404);
    assert.equal((await getLastSession(user, randomUUID())).statusCode, 404);
  });

  it('id ou excludeSessionId invalidos: 400', async () => {
    assert.equal((await getLastSession(user, 'nao-e-uuid')).statusCode, 400);
    assert.equal(
      (await getLastSession(user, catalogId, '?excludeSessionId=nao-e-uuid')).statusCode,
      400,
    );
  });

  it('sem token: 401', async () => {
    assert.equal((await getLastSession(null, catalogId)).statusCode, 401);
  });
});

describe('defaultRestSeconds', () => {
  it('opcional: persiste quando informado e null quando omitido', async () => {
    const sheet = await createSheet(user, {
      name: 'Descanso',
      days: [
        {
          weekday: 2,
          order: 0,
          exercises: [
            { exerciseId: catalogId, sortOrder: 0, defaultRestSeconds: 90 },
            { exerciseId: secondCatalogId, sortOrder: 1 },
          ],
        },
      ],
    });

    assert.deepEqual(
      sheet.days[0]!.exercises.map((exercise) => exercise.defaultRestSeconds),
      [90, null],
    );
  });

  it('PATCH substitui o valor junto com os dias', async () => {
    const sheet = await createSheet(user, {
      name: 'Descanso PATCH',
      days: [
        {
          weekday: 3,
          order: 0,
          exercises: [{ exerciseId: catalogId, sortOrder: 0, defaultRestSeconds: 60 }],
        },
      ],
    });
    const response = await ctx.request(user, {
      method: 'PATCH',
      url: `/workout-sheets/${sheet.id}`,
      payload: {
        days: [
          {
            weekday: 3,
            order: 0,
            exercises: [{ exerciseId: catalogId, sortOrder: 0, defaultRestSeconds: 0 }],
          },
        ],
      },
    });

    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json<SheetDetail>().days[0]!.exercises[0]!.defaultRestSeconds, 0);
  });

  it('rejeita negativo, fracionado e acima de 3600', async () => {
    const responses = await Promise.all(
      [-1, 1.5, 3601].map((defaultRestSeconds) =>
        ctx.request(user, {
          method: 'POST',
          url: '/workout-sheets',
          payload: {
            name: 'Invalida',
            days: [
              {
                weekday: 1,
                order: 0,
                exercises: [{ exerciseId: catalogId, sortOrder: 0, defaultRestSeconds }],
              },
            ],
          },
        }),
      ),
    );

    assert.deepEqual(
      responses.map((response) => response.statusCode),
      [400, 400, 400],
    );
  });
});

describe('POST /workout-sheets/:id/duplicate', () => {
  let original: SheetDetail;
  let customId: string;

  before(async () => {
    customId = await createCustomExercise(user, 'Custom para copia');
    original = await createSheet(user, {
      name: 'Hipertrofia ABC',
      days: [
        {
          weekday: 5,
          order: 1,
          exercises: [
            { exerciseId: secondCatalogId, sortOrder: 1, targetSets: 3, targetReps: 12 },
            {
              customExerciseId: customId,
              sortOrder: 0,
              targetSets: 4,
              targetReps: 8,
              defaultRestSeconds: 120,
            },
          ],
        },
        {
          weekday: 1,
          order: 0,
          exercises: [{ exerciseId: catalogId, sortOrder: 0, defaultRestSeconds: 45 }],
        },
      ],
    });
  });

  /** Estrutura comparavel sem ids. */
  function shape(sheet: SheetDetail) {
    return sheet.days.map((day) => ({
      weekday: day.weekday,
      order: day.order,
      exercises: day.exercises.map(({ id: _id, ...rest }) => rest),
    }));
  }

  it('sem body: 201, nome com sufixo e mesma estrutura (ordem, metas e descanso)', async () => {
    const response = await duplicate(user, original.id);

    assert.equal(response.statusCode, 201, response.body);

    const copy = response.json<SheetDetail>();

    assert.notEqual(copy.id, original.id);
    assert.equal(copy.name, 'Hipertrofia ABC (copia)');
    assert.deepEqual(shape(copy), shape(original));
    assert.deepEqual(
      copy.days.map((day) => day.weekday),
      [1, 5],
      'dias ordenados por order',
    );
    assert.deepEqual(
      copy.days[1]!.exercises.map((exercise) => exercise.customExerciseId ?? exercise.exerciseId),
      [customId, secondCatalogId],
      'exercicios ordenados por sortOrder',
    );
  });

  it('ids novos: a copia e independente da original', async () => {
    const copy = (await duplicate(user, original.id)).json<SheetDetail>();
    const originalIds = new Set(
      original.days.flatMap((day) => [day.id, ...day.exercises.map((exercise) => exercise.id)]),
    );
    const copyIds = copy.days.flatMap((day) => [
      day.id,
      ...day.exercises.map((exercise) => exercise.id),
    ]);

    assert.ok(copyIds.every((id) => !originalIds.has(id)));

    const patch = await ctx.request(user, {
      method: 'PATCH',
      url: `/workout-sheets/${copy.id}`,
      payload: {
        name: 'Copia editada',
        days: [{ weekday: 0, order: 0, exercises: [{ exerciseId: catalogId, sortOrder: 0 }] }],
      },
    });
    assert.equal(patch.statusCode, 200, patch.body);

    const reread = await ctx.request(user, {
      method: 'GET',
      url: `/workout-sheets/${original.id}`,
    });

    assert.equal(reread.json<SheetDetail>().name, 'Hipertrofia ABC');
    assert.deepEqual(shape(reread.json<SheetDetail>()), shape(original));
  });

  it('aparece na listagem do usuario', async () => {
    const copy = (await duplicate(user, original.id, { name: 'Na lista' })).json<SheetDetail>();
    const list = await ctx.request(user, { method: 'GET', url: '/workout-sheets' });

    assert.ok(list.json<{ items: { id: string }[] }>().items.some((item) => item.id === copy.id));
  });

  it('aceita nome customizado', async () => {
    const response = await duplicate(user, original.id, { name: 'Hipertrofia ABC v2' });

    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json<SheetDetail>().name, 'Hipertrofia ABC v2');
  });

  it('nome padrao respeita o limite de 120 caracteres', async () => {
    const longName = 'x'.repeat(120);
    const sheet = await createSheet(user, {
      name: longName,
      days: [{ weekday: 1, order: 0, exercises: [{ exerciseId: catalogId, sortOrder: 0 }] }],
    });
    const copy = (await duplicate(user, sheet.id)).json<SheetDetail>();

    assert.equal(copy.name.length, 120);
    assert.ok(copy.name.endsWith(' (copia)'));
  });

  it('copia mesmo com custom exercise removido depois da criacao', async () => {
    const removable = await createCustomExercise(user, 'Some depois');
    const sheet = await createSheet(user, {
      name: 'Com custom removido',
      days: [
        {
          weekday: 1,
          order: 0,
          exercises: [{ customExerciseId: removable, sortOrder: 0 }],
        },
      ],
    });
    await ctx.request(user, { method: 'DELETE', url: `/exercises/custom/${removable}` });

    const response = await duplicate(user, sheet.id);

    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json<SheetDetail>().days[0]!.exercises[0]!.customExerciseId, removable);
  });

  it('planilha removida, de outro usuario ou inexistente: 404', async () => {
    const removed = await simpleSheet(user);
    await ctx.request(user, { method: 'DELETE', url: `/workout-sheets/${removed}` });

    const responses = await Promise.all([
      duplicate(user, removed),
      duplicate(other, original.id),
      duplicate(user, randomUUID()),
    ]);

    assert.deepEqual(
      responses.map((response) => response.statusCode),
      [404, 404, 404],
    );
  });

  it('nome invalido: 400', async () => {
    const responses = await Promise.all([
      duplicate(user, original.id, { name: '' }),
      duplicate(user, original.id, { name: 'x'.repeat(121) }),
    ]);

    assert.deepEqual(
      responses.map((response) => response.statusCode),
      [400, 400],
    );
  });
});
