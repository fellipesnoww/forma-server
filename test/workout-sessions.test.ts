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
 * Regras de negocio da 1.5 (sessoes de treino). Ownership e o fluxo principal ficam em
 * `authorization.test.ts` e `smoke.test.ts`; aqui entram as validacoes da feature.
 */

interface SetInput {
  setNumber: number;
  reps: number;
  weightKg: number;
  completed?: boolean;
}

interface SessionDetail {
  id: string;
  sheetId: string;
  sheetName: string;
  performedAt: string;
  completedAt: string | null;
  durationMinutes: number | null;
  exerciseCount: number;
  setCount: number;
  photoUrl: string | null;
  comment: string | null;
  exercises: {
    id: string;
    name: string;
    sortOrder: number;
    sets: { id: string; setNumber: number; reps: number; weightKg: number; completed: boolean }[];
  }[];
}

let ctx: TestContext;
let user: TestUser;
let catalogId: string;
let sheetId: string;

const MINUTE_MS = 60 * 1000;

function exercise(sets: SetInput[], ref: object = { exerciseId: catalogId }, sortOrder = 0) {
  return { ...ref, sortOrder, sets };
}

function oneSet(overrides: Partial<SetInput> = {}): SetInput {
  return { setNumber: 1, reps: 10, weightKg: 20, ...overrides };
}

function postSession(payload: object) {
  return ctx.request(user, { method: 'POST', url: '/workout-sessions', payload });
}

async function createSession(payload: object = {}): Promise<SessionDetail> {
  const response = await postSession({ sheetId, exercises: [exercise([oneSet()])], ...payload });

  assert.equal(response.statusCode, 201, response.body);

  return response.json<SessionDetail>();
}

function patchSession(id: string, payload: object) {
  return ctx.request(user, { method: 'PATCH', url: `/workout-sessions/${id}`, payload });
}

async function createSheet(name: string): Promise<string> {
  const response = await ctx.request(user, {
    method: 'POST',
    url: '/workout-sheets',
    payload: {
      name,
      days: [{ weekday: 1, order: 0, exercises: [{ exerciseId: catalogId, sortOrder: 0 }] }],
    },
  });

  return response.json<{ id: string }>().id;
}

function assertValidationError(response: { statusCode: number; body: string }): void {
  assert.equal(response.statusCode, 400, response.body);
  assert.equal(
    JSON.parse(response.body).error.code as string,
    'VALIDATION_ERROR',
    'envelope de erro padrao',
  );
}

before(async () => {
  ctx = await createTestContext();
  user = await ctx.createUser();
  catalogId = await findCatalogExerciseId(ctx, user);
  sheetId = await createSheet('Planilha base');
});

after(async () => {
  await ctx.close();
});

describe('performedAt', () => {
  it('default e o horario da criacao', async () => {
    const startedAt = Date.now();
    const session = await createSession();
    const performed = new Date(session.performedAt).getTime();

    assert.ok(performed >= startedAt - 1000 && performed <= Date.now() + 1000, session.performedAt);
  });

  it('aceita data passada (registro retroativo)', async () => {
    const session = await createSession({ performedAt: '2025-03-10T07:30:00.000Z' });

    assert.equal(session.performedAt, '2025-03-10T07:30:00.000Z');
  });

  it('aceita offset de fuso e normaliza para UTC', async () => {
    const session = await createSession({ performedAt: '2025-03-10T07:30:00-03:00' });

    assert.equal(session.performedAt, '2025-03-10T10:30:00.000Z');
  });

  it('aceita ate 5 min no futuro (relogio do client adiantado)', async () => {
    const skewed = new Date(Date.now() + 2 * MINUTE_MS).toISOString();
    const session = await createSession({ performedAt: skewed });

    assert.equal(session.performedAt, skewed);
  });

  it('rejeita data alem da tolerancia no futuro, no POST e no PATCH', async () => {
    const future = new Date(Date.now() + 10 * MINUTE_MS).toISOString();
    const session = await createSession();

    assertValidationError(
      await postSession({ sheetId, performedAt: future, exercises: [exercise([oneSet()])] }),
    );
    assertValidationError(await patchSession(session.id, { performedAt: future }));
  });

  it('rejeita string que nao e datetime ISO', async () => {
    assertValidationError(
      await postSession({ sheetId, performedAt: '10/03/2025', exercises: [exercise([oneSet()])] }),
    );
  });
});

describe('validacao de series', () => {
  it('aceita reps = 0 e weightKg = 0 (peso corporal) e weightKg fracionado', async () => {
    const session = await createSession({
      exercises: [
        exercise([oneSet({ reps: 0, weightKg: 0 }), oneSet({ setNumber: 2, weightKg: 22.5 })]),
      ],
    });

    assert.deepEqual(
      session.exercises[0]!.sets.map((set) => [set.reps, set.weightKg]),
      [
        [0, 0],
        [10, 22.5],
      ],
    );
  });

  it('completed tem default false', async () => {
    const session = await createSession();

    assert.equal(session.exercises[0]!.sets[0]!.completed, false);
  });

  const invalidSets: [string, SetInput[]][] = [
    ['reps negativo', [oneSet({ reps: -1 })]],
    ['reps fracionado', [oneSet({ reps: 8.5 })]],
    ['weightKg negativo', [oneSet({ weightKg: -0.5 })]],
    ['setNumber zero', [oneSet({ setNumber: 0 })]],
    ['setNumber duplicado no exercicio', [oneSet(), oneSet({ reps: 5 })]],
    ['lista de series vazia', []],
  ];

  invalidSets.forEach(([label, sets]) => {
    it(`${label} -> 400`, async () => {
      assertValidationError(await postSession({ sheetId, exercises: [exercise(sets)] }));
    });
  });

  it('setNumber pode repetir entre exercicios diferentes', async () => {
    const session = await createSession({
      exercises: [exercise([oneSet()]), exercise([oneSet()], { exerciseId: catalogId }, 1)],
    });

    assert.equal(session.exercises.length, 2);
  });

  it('series voltam ordenadas por setNumber e exercicios por sortOrder', async () => {
    const session = await createSession({
      exercises: [
        exercise(
          [oneSet({ setNumber: 3 }), oneSet({ setNumber: 1 })],
          { exerciseId: catalogId },
          1,
        ),
        exercise([oneSet({ setNumber: 2 })], { exerciseId: catalogId }, 0),
      ],
    });

    assert.deepEqual(
      session.exercises.map((ex) => [ex.sortOrder, ex.sets.map((set) => set.setNumber)]),
      [
        [0, [2]],
        [1, [1, 3]],
      ],
    );
  });
});

describe('referencias', () => {
  it('exerciseId e customExerciseId juntos -> 400', async () => {
    const custom = await ctx.request(user, {
      method: 'POST',
      url: '/exercises/custom',
      payload: { name: 'Ambos' },
    });

    assertValidationError(
      await postSession({
        sheetId,
        exercises: [
          exercise([oneSet()], {
            exerciseId: catalogId,
            customExerciseId: custom.json<{ id: string }>().id,
          }),
        ],
      }),
    );
  });

  it('nenhuma referencia de exercicio -> 400', async () => {
    assertValidationError(await postSession({ sheetId, exercises: [exercise([oneSet()], {})] }));
  });

  it('exerciseId inexistente -> 400', async () => {
    assertValidationError(
      await postSession({
        sheetId,
        exercises: [exercise([oneSet()], { exerciseId: '00000000-0000-4000-8000-000000000000' })],
      }),
    );
  });

  it('lista de exercicios vazia -> 400', async () => {
    assertValidationError(await postSession({ sheetId, exercises: [] }));
  });

  it('sheetId inexistente -> 400', async () => {
    assertValidationError(
      await postSession({
        sheetId: '00000000-0000-4000-8000-000000000000',
        exercises: [exercise([oneSet()])],
      }),
    );
  });

  it('planilha removida nao aceita sessao nova, mas sessoes antigas continuam legiveis', async () => {
    const doomedSheet = await createSheet('Sera removida');
    const old = await createSession({ sheetId: doomedSheet });

    await ctx.request(user, { method: 'DELETE', url: `/workout-sheets/${doomedSheet}` });

    assertValidationError(
      await postSession({ sheetId: doomedSheet, exercises: [exercise([oneSet()])] }),
    );

    const detail = await ctx.request(user, { method: 'GET', url: `/workout-sessions/${old.id}` });

    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json<SessionDetail>().sheetName, 'Sera removida');
  });

  it('custom exercise removido: nao entra em sessao nova, mas o nome segue no historico', async () => {
    const custom = await ctx.request(user, {
      method: 'POST',
      url: '/exercises/custom',
      payload: { name: 'Exercicio aposentado' },
    });
    const customExerciseId = custom.json<{ id: string }>().id;
    const old = await createSession({ exercises: [exercise([oneSet()], { customExerciseId })] });

    await ctx.request(user, { method: 'DELETE', url: `/exercises/custom/${customExerciseId}` });

    assertValidationError(
      await postSession({ sheetId, exercises: [exercise([oneSet()], { customExerciseId })] }),
    );

    const detail = await ctx.request(user, { method: 'GET', url: `/workout-sessions/${old.id}` });

    assert.equal(detail.json<SessionDetail>().exercises[0]!.name, 'Exercicio aposentado');
  });
});

describe('comentario', () => {
  it('ate 1000 caracteres; acima -> 400', async () => {
    const ok = await createSession({ comment: 'a'.repeat(1000) });

    assert.equal(ok.comment?.length, 1000);
    assertValidationError(
      await postSession({ sheetId, comment: 'a'.repeat(1001), exercises: [exercise([oneSet()])] }),
    );
  });

  it('PATCH com comment null remove o comentario', async () => {
    const session = await createSession({ comment: 'temporario' });
    const patched = await patchSession(session.id, { comment: null });

    assert.equal(patched.json<SessionDetail>().comment, null);
  });
});

describe('PATCH', () => {
  it('body vazio -> 400', async () => {
    const session = await createSession();

    assertValidationError(await patchSession(session.id, {}));
  });

  it('exercises substitui todos os exercicios e series (ids novos)', async () => {
    const session = await createSession({
      exercises: [exercise([oneSet(), oneSet({ setNumber: 2 })])],
    });
    const oldSetIds = session.exercises[0]!.sets.map((set) => set.id);

    const patched = (
      await patchSession(session.id, {
        exercises: [exercise([oneSet({ reps: 12, weightKg: 30, completed: true })])],
      })
    ).json<SessionDetail>();

    assert.equal(patched.exercises.length, 1);
    assert.equal(patched.exercises[0]!.sets.length, 1);
    assert.ok(!oldSetIds.includes(patched.exercises[0]!.sets[0]!.id));
    assert.deepEqual(
      [patched.exercises[0]!.sets[0]!.reps, patched.exercises[0]!.sets[0]!.completed],
      [12, true],
    );
  });

  it('sem exercises, series ficam intactas', async () => {
    const session = await createSession();
    const patched = (
      await patchSession(session.id, { comment: 'so comentario' })
    ).json<SessionDetail>();

    assert.deepEqual(patched.exercises, session.exercises);
  });

  it('exercises no PATCH passam pelas mesmas validacoes do POST', async () => {
    const session = await createSession();

    assertValidationError(
      await patchSession(session.id, { exercises: [exercise([oneSet({ reps: -3 })])] }),
    );
  });

  it('photoUrl so aceita null (string -> 400)', async () => {
    const session = await createSession();

    assertValidationError(
      await patchSession(session.id, { photoUrl: '/media/00000000-0000-4000-8000-000000000000' }),
    );
  });

  it('continua permitido depois de complete (correcao retroativa)', async () => {
    const session = await createSession();

    await ctx.request(user, { method: 'POST', url: `/workout-sessions/${session.id}/complete` });

    const patched = await patchSession(session.id, { comment: 'corrigido depois' });

    assert.equal(patched.statusCode, 200);
    assert.ok(patched.json<SessionDetail>().completedAt);
  });
});

describe('complete', () => {
  function complete(id: string) {
    return ctx.request(user, { method: 'POST', url: `/workout-sessions/${id}/complete` });
  }

  it('sessao nova nasce em andamento (completedAt null)', async () => {
    const session = await createSession();

    assert.equal(session.completedAt, null);
  });

  it('chamadas repetidas devolvem 200 com o completedAt original', async () => {
    const session = await createSession();
    const first = await complete(session.id);
    const second = await complete(session.id);

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.ok(first.json<SessionDetail>().completedAt);
    assert.equal(second.json<SessionDetail>().completedAt, first.json<SessionDetail>().completedAt);
  });

  it('chamadas concorrentes nao sobrescrevem o completedAt', async () => {
    const session = await createSession();
    const responses = await Promise.all([1, 2, 3, 4, 5].map(() => complete(session.id)));
    const stamps = new Set(responses.map((response) => response.json<SessionDetail>().completedAt));
    const detail = await ctx.request(user, {
      method: 'GET',
      url: `/workout-sessions/${session.id}`,
    });

    assert.ok(responses.every((response) => response.statusCode === 200));
    assert.equal(stamps.size, 1, `completedAt divergentes: ${[...stamps].join(', ')}`);
    assert.equal(detail.json<SessionDetail>().completedAt, [...stamps][0]);
  });

  it('nao altera performedAt', async () => {
    const session = await createSession({ performedAt: '2025-05-01T12:00:00.000Z' });
    const completed = (await complete(session.id)).json<SessionDetail>();

    assert.equal(completed.performedAt, '2025-05-01T12:00:00.000Z');
  });
});

describe('duracao', () => {
  function complete(id: string) {
    return ctx.request(user, { method: 'POST', url: `/workout-sessions/${id}/complete` });
  }

  it('registro retroativo informa a duracao no POST', async () => {
    const session = await createSession({
      performedAt: '2025-03-10T21:30:00.000Z',
      durationMinutes: 55,
    });

    assert.equal(session.durationMinutes, 55);
  });

  it('omitida fica null ate o complete', async () => {
    const session = await createSession();

    assert.equal(session.durationMinutes, null);
  });

  it('complete de sessao ao vivo calcula a partir de performedAt', async () => {
    const startedAt = new Date(Date.now() - 52 * MINUTE_MS).toISOString();
    const session = await createSession({ performedAt: startedAt });
    const completed = (await complete(session.id)).json<SessionDetail>();

    assert.equal(completed.durationMinutes, 52);
  });

  it('complete logo apos iniciar arredonda para no minimo 1 minuto', async () => {
    const session = await createSession();
    const completed = (await complete(session.id)).json<SessionDetail>();

    assert.equal(completed.durationMinutes, 1);
  });

  it('complete nao inventa duracao para registro retroativo de dias atras', async () => {
    const session = await createSession({ performedAt: '2025-03-10T21:30:00.000Z' });
    const completed = (await complete(session.id)).json<SessionDetail>();

    assert.ok(completed.completedAt);
    assert.equal(completed.durationMinutes, null);
  });

  it('complete preserva a duracao informada pelo client', async () => {
    const startedAt = new Date(Date.now() - 90 * MINUTE_MS).toISOString();
    const session = await createSession({ performedAt: startedAt, durationMinutes: 40 });
    const completed = (await complete(session.id)).json<SessionDetail>();

    assert.equal(completed.durationMinutes, 40);
  });

  it('PATCH altera e null remove a duracao', async () => {
    const session = await createSession({ durationMinutes: 30 });
    const changed = await patchSession(session.id, { durationMinutes: 45 });
    const cleared = await patchSession(session.id, { durationMinutes: null });

    assert.equal(changed.json<SessionDetail>().durationMinutes, 45);
    assert.equal(cleared.json<SessionDetail>().durationMinutes, null);
  });

  const invalid: [string, unknown][] = [
    ['zero', 0],
    ['acima de 24h', 1441],
    ['fracionada', 1.5],
    ['texto', '55'],
  ];

  invalid.forEach(([label, durationMinutes]) => {
    it(`duracao ${label} -> 400`, async () => {
      assertValidationError(
        await postSession({ sheetId, durationMinutes, exercises: [exercise([oneSet()])] }),
      );
    });
  });
});

describe('contagens do resumo', () => {
  it('exerciseCount e setCount no detalhe e na listagem', async () => {
    const session = await createSession({
      performedAt: '2024-01-15T10:00:00.000Z',
      exercises: [
        exercise([oneSet(), oneSet({ setNumber: 2 }), oneSet({ setNumber: 3 })]),
        exercise([oneSet()], { exerciseId: catalogId }, 1),
      ],
    });
    const list = await ctx.request(user, {
      method: 'GET',
      url: '/workout-sessions?from=2024-01-15T00:00:00Z&to=2024-01-15T23:59:59Z',
    });
    const item = list
      .json<{ items: SessionDetail[] }>()
      .items.find((candidate) => candidate.id === session.id);

    assert.equal(session.exerciseCount, 2);
    assert.equal(session.setCount, 4);
    assert.equal(item?.exerciseCount, 2);
    assert.equal(item.setCount, 4);
    assert.equal('exercises' in item, false, 'listagem continua sem series');
  });
});

describe('foto', () => {
  function upload(id: string, payload: object) {
    return ctx.request(user, { method: 'POST', url: `/workout-sessions/${id}/photo`, payload });
  }

  it('associa a foto a sessao e o binario e baixavel', async () => {
    const session = await createSession();
    const response = await upload(session.id, { data: PNG_1X1_BASE64, mimeType: 'image/png' });
    const { photoUrl } = response.json<{ photoUrl: string }>();
    const detail = await ctx.request(user, {
      method: 'GET',
      url: `/workout-sessions/${session.id}`,
    });
    const bytes = await ctx.request(user, { method: 'GET', url: photoUrl });

    assert.equal(response.statusCode, 200);
    assert.equal(detail.json<SessionDetail>().photoUrl, photoUrl);
    assert.equal(bytes.statusCode, 200);
    assert.equal(bytes.headers['content-type'], 'image/png');
  });

  it('aceita prefixo data URL', async () => {
    const session = await createSession();
    const response = await upload(session.id, {
      data: `data:image/png;base64,${PNG_1X1_BASE64}`,
      mimeType: 'image/png',
    });

    assert.equal(response.statusCode, 200, response.body);
  });

  it('novo upload substitui a foto anterior', async () => {
    const session = await createSession();
    const first = (await upload(session.id, { data: PNG_1X1_BASE64, mimeType: 'image/png' })).json<{
      photoUrl: string;
    }>();
    const second = (
      await upload(session.id, { data: PNG_1X1_BASE64, mimeType: 'image/png' })
    ).json<{
      photoUrl: string;
    }>();
    const detail = await ctx.request(user, {
      method: 'GET',
      url: `/workout-sessions/${session.id}`,
    });

    assert.notEqual(second.photoUrl, first.photoUrl);
    assert.equal(detail.json<SessionDetail>().photoUrl, second.photoUrl);
  });

  it('PATCH photoUrl null remove a foto', async () => {
    const session = await createSession();

    await upload(session.id, { data: PNG_1X1_BASE64, mimeType: 'image/png' });

    const patched = await patchSession(session.id, { photoUrl: null });

    assert.equal(patched.json<SessionDetail>().photoUrl, null);
  });

  it('MIME fora da lista -> 415', async () => {
    const session = await createSession();
    const response = await upload(session.id, { data: PNG_1X1_BASE64, mimeType: 'image/gif' });

    assert.equal(response.statusCode, 415);
  });

  it('MIME declarado diferente do conteudo -> rejeitado', async () => {
    const session = await createSession();
    const response = await upload(session.id, { data: PNG_1X1_BASE64, mimeType: 'image/jpeg' });

    assert.ok([400, 415].includes(response.statusCode), `status ${response.statusCode}`);
  });
});

describe('historico (GET /workout-sessions)', () => {
  let historyUser: TestUser;
  let sheetA: string;
  let sheetB: string;

  const listFor = (query: string) =>
    ctx.request(historyUser, { method: 'GET', url: `/workout-sessions${query}` });

  before(async () => {
    // Usuario proprio: o historico precisa de um conjunto conhecido de sessoes
    historyUser = await ctx.createUser();

    const mkSheet = async (name: string) =>
      (
        await ctx.request(historyUser, {
          method: 'POST',
          url: '/workout-sheets',
          payload: {
            name,
            days: [{ weekday: 2, order: 0, exercises: [{ exerciseId: catalogId, sortOrder: 0 }] }],
          },
        })
      ).json<{ id: string }>().id;

    sheetA = await mkSheet('A');
    sheetB = await mkSheet('B');

    const dates: [string, string][] = [
      [sheetA, '2025-01-10T10:00:00.000Z'],
      [sheetA, '2025-02-10T10:00:00.000Z'],
      [sheetB, '2025-02-20T10:00:00.000Z'],
      [sheetB, '2025-03-10T10:00:00.000Z'],
    ];

    await dates.reduce(
      (chain, [id, performedAt]) =>
        chain.then(async () => {
          await ctx.request(historyUser, {
            method: 'POST',
            url: '/workout-sessions',
            payload: { sheetId: id, performedAt, exercises: [exercise([oneSet()])] },
          });
        }),
      Promise.resolve(),
    );
  });

  it('ordena por performedAt desc, nao por data de criacao', async () => {
    const { items } = (await listFor('')).json<{ items: SessionDetail[] }>();

    assert.deepEqual(
      items.map((item) => item.performedAt),
      [
        '2025-03-10T10:00:00.000Z',
        '2025-02-20T10:00:00.000Z',
        '2025-02-10T10:00:00.000Z',
        '2025-01-10T10:00:00.000Z',
      ],
    );
  });

  it('item da lista nao traz exercises; traz sheetName', async () => {
    const { items } = (await listFor('')).json<{ items: Record<string, unknown>[] }>();

    assert.ok(!('exercises' in items[0]!));
    assert.equal(items[0]!.sheetName, 'B');
  });

  it('from/to sao inclusivos e filtram por performedAt', async () => {
    const response = await listFor('?from=2025-02-10T10:00:00Z&to=2025-02-20T10:00:00Z');

    assert.equal(response.json<{ total: number }>().total, 2);
  });

  it('filtra por sheetId', async () => {
    const { items, total } = (await listFor(`?sheetId=${sheetA}`)).json<{
      items: SessionDetail[];
      total: number;
    }>();

    assert.equal(total, 2);
    assert.ok(items.every((item) => item.sheetId === sheetA));
  });

  it('combina sheetId e periodo', async () => {
    const response = await listFor(`?sheetId=${sheetB}&from=2025-03-01T00:00:00Z`);

    assert.equal(response.json<{ total: number }>().total, 1);
  });

  it('pagina com total, page e limit', async () => {
    const page2 = (await listFor('?limit=3&page=2')).json<{
      items: SessionDetail[];
      total: number;
      page: number;
      limit: number;
    }>();

    assert.deepEqual([page2.total, page2.page, page2.limit, page2.items.length], [4, 2, 3, 1]);
    assert.equal(page2.items[0]!.performedAt, '2025-01-10T10:00:00.000Z');
  });

  it('defaults: page 1, limit 20', async () => {
    const body = (await listFor('')).json<{ page: number; limit: number }>();

    assert.deepEqual([body.page, body.limit], [1, 20]);
  });

  const invalidQueries = ['?limit=101', '?limit=0', '?page=0', '?from=ontem', '?sheetId=abc'];

  invalidQueries.forEach((query) => {
    it(`query invalida ${query} -> 400`, async () => {
      assertValidationError(await listFor(query));
    });
  });
});
