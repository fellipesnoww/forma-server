import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { PNG_1X1_BASE64, createTestContext, type TestContext, type TestUser } from './helpers.js';

/**
 * Regras de negocio da 2.1 (atividades livres + tipos). Ownership entre usuarios fica em
 * `authorization.test.ts`; aqui entram as validacoes da feature.
 */

interface ActivityType {
  id: string;
  name: string;
  source: 'default' | 'custom';
}

interface Activity {
  id: string;
  activityTypeId: string;
  activityTypeName: string;
  performedAt: string;
  durationMinutes: number;
  comment: string | null;
  photoUrl: string | null;
}

let ctx: TestContext;
let user: TestUser;
let defaultTypeId: string;

const MINUTE_MS = 60 * 1000;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

function listTypes(as: TestUser = user) {
  return ctx.request(as, { method: 'GET', url: '/activity-types' });
}

function postType(name: string, as: TestUser = user) {
  return ctx.request(as, { method: 'POST', url: '/activity-types/custom', payload: { name } });
}

function postActivity(payload: object, as: TestUser = user) {
  return ctx.request(as, {
    method: 'POST',
    url: '/activities',
    payload: { activityTypeId: defaultTypeId, durationMinutes: 45, ...payload },
  });
}

async function createActivity(payload: object = {}, as: TestUser = user): Promise<Activity> {
  const response = await postActivity(payload, as);

  assert.equal(response.statusCode, 201, response.body);

  return response.json<Activity>();
}

function patchActivity(id: string, payload: object) {
  return ctx.request(user, { method: 'PATCH', url: `/activities/${id}`, payload });
}

function assertValidationError(response: { statusCode: number; body: string }): void {
  assert.equal(response.statusCode, 400, response.body);
  assert.equal(JSON.parse(response.body).error.code as string, 'VALIDATION_ERROR');
}

before(async () => {
  ctx = await createTestContext();
  user = await ctx.createUser();

  const { items } = (await listTypes()).json<{ items: ActivityType[] }>();
  const natacao = items.find((type) => type.name === 'Natação');

  if (!natacao) {
    throw new Error('Tipos padrao ausentes — rode `npm run db:seed` antes dos testes');
  }

  defaultTypeId = natacao.id;
});

after(async () => {
  await ctx.close();
});

describe('tipos de atividade', () => {
  it('usuario novo ve os tipos padrao do seed', async () => {
    const { items } = (await listTypes()).json<{ items: ActivityType[] }>();
    const names = items.map((type) => type.name);

    ['Natação', 'Futebol', 'Corrida', 'Atletismo'].forEach((name) => {
      assert.ok(names.includes(name), `faltou ${name}`);
    });
    assert.ok(items.every((type) => type.source === 'default'));
  });

  it('cria tipo personalizado e ele aparece depois dos padrao', async () => {
    const created = await postType('Stand up paddle');
    const { items } = (await listTypes()).json<{ items: ActivityType[] }>();

    assert.equal(created.statusCode, 201, created.body);
    assert.deepEqual(
      { ...created.json<ActivityType>(), id: undefined },
      { id: undefined, name: 'Stand up paddle', source: 'custom' },
    );
    assert.equal(items.at(-1)!.name, 'Stand up paddle');
    assert.equal(items.at(-1)!.source, 'custom');
  });

  it('remove espacos nas pontas do nome', async () => {
    const created = await postType('  Remo  ');

    assert.equal(created.json<ActivityType>().name, 'Remo');
  });

  it('nome igual a um tipo padrao (sem diferenciar maiusculas) -> 409', async () => {
    const response = await postType('NATAÇÃO');

    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json<{ error: { code: string } }>().error.code, 'CONFLICT');
  });

  it('nome repetido entre os personalizados do usuario -> 409', async () => {
    await postType('Escalada');

    assert.equal((await postType('escalada')).statusCode, 409);
  });

  it('mesmo nome personalizado em usuarios diferentes e permitido', async () => {
    const other = await ctx.createUser();

    await postType('Slackline');

    assert.equal((await postType('Slackline', other)).statusCode, 201);
  });

  const invalidNames: [string, string][] = [
    ['vazio', ''],
    ['so espacos', '   '],
    ['acima de 80 caracteres', 'a'.repeat(81)],
  ];

  invalidNames.forEach(([label, name]) => {
    it(`nome ${label} -> 400`, async () => {
      assertValidationError(await postType(name));
    });
  });
});

describe('registro de atividade', () => {
  it('cria com tipo padrao, devolve o nome do tipo e nasce sem foto', async () => {
    const activity = await createActivity({ durationMinutes: 60, comment: '2 km' });

    assert.equal(activity.activityTypeId, defaultTypeId);
    assert.equal(activity.activityTypeName, 'Natação');
    assert.equal(activity.durationMinutes, 60);
    assert.equal(activity.comment, '2 km');
    assert.equal(activity.photoUrl, null);
  });

  it('cria com tipo personalizado do proprio usuario', async () => {
    const type = (await postType('Kitesurf')).json<ActivityType>();
    const activity = await createActivity({ activityTypeId: type.id });

    assert.equal(activity.activityTypeName, 'Kitesurf');
  });

  it('tipo inexistente -> 400', async () => {
    assertValidationError(await postActivity({ activityTypeId: UNKNOWN_ID }));
  });

  it('activityTypeId ausente -> 400', async () => {
    assertValidationError(
      await ctx.request(user, {
        method: 'POST',
        url: '/activities',
        payload: { durationMinutes: 30 },
      }),
    );
  });

  it('durationMinutes ausente -> 400', async () => {
    assertValidationError(
      await ctx.request(user, {
        method: 'POST',
        url: '/activities',
        payload: { activityTypeId: defaultTypeId },
      }),
    );
  });

  it('durationMinutes aceita 1 e 1440', async () => {
    assert.equal((await createActivity({ durationMinutes: 1 })).durationMinutes, 1);
    assert.equal((await createActivity({ durationMinutes: 1440 })).durationMinutes, 1440);
  });

  const invalidDurations: [string, number][] = [
    ['zero', 0],
    ['negativa', -10],
    ['fracionada', 30.5],
    ['acima de 24h', 1441],
  ];

  invalidDurations.forEach(([label, durationMinutes]) => {
    it(`duracao ${label} -> 400`, async () => {
      assertValidationError(await postActivity({ durationMinutes }));
    });
  });

  it('comentario ate 1000 caracteres; acima -> 400', async () => {
    assert.equal((await createActivity({ comment: 'a'.repeat(1000) })).comment?.length, 1000);
    assertValidationError(await postActivity({ comment: 'a'.repeat(1001) }));
  });
});

describe('performedAt', () => {
  it('default e o horario da criacao', async () => {
    const startedAt = Date.now();
    const activity = await createActivity();
    const performed = new Date(activity.performedAt).getTime();

    assert.ok(performed >= startedAt - 1000 && performed <= Date.now() + 1000);
  });

  it('aceita data passada (registro retroativo)', async () => {
    const activity = await createActivity({ performedAt: '2025-03-10T07:30:00.000Z' });

    assert.equal(activity.performedAt, '2025-03-10T07:30:00.000Z');
  });

  it('aceita offset de fuso e normaliza para UTC', async () => {
    const activity = await createActivity({ performedAt: '2025-03-10T07:30:00-03:00' });

    assert.equal(activity.performedAt, '2025-03-10T10:30:00.000Z');
  });

  it('aceita ate 5 min no futuro (relogio do client adiantado)', async () => {
    const skewed = new Date(Date.now() + 2 * MINUTE_MS).toISOString();

    assert.equal((await createActivity({ performedAt: skewed })).performedAt, skewed);
  });

  it('rejeita data alem da tolerancia no futuro, no POST e no PATCH', async () => {
    const future = new Date(Date.now() + 10 * MINUTE_MS).toISOString();
    const activity = await createActivity();

    assertValidationError(await postActivity({ performedAt: future }));
    assertValidationError(await patchActivity(activity.id, { performedAt: future }));
  });

  it('rejeita string que nao e datetime ISO', async () => {
    assertValidationError(await postActivity({ performedAt: '10/03/2025' }));
  });
});

describe('PATCH', () => {
  it('body vazio -> 400', async () => {
    const activity = await createActivity();

    assertValidationError(await patchActivity(activity.id, {}));
  });

  it('altera tipo, duracao e data, mantendo o que nao foi enviado', async () => {
    const activity = await createActivity({ comment: 'mantido' });
    const futebol = (await listTypes())
      .json<{ items: ActivityType[] }>()
      .items.find((type) => type.name === 'Futebol')!;

    const patched = (
      await patchActivity(activity.id, {
        activityTypeId: futebol.id,
        durationMinutes: 90,
        performedAt: '2025-06-01T18:00:00.000Z',
      })
    ).json<Activity>();

    assert.deepEqual(
      [patched.activityTypeName, patched.durationMinutes, patched.performedAt, patched.comment],
      ['Futebol', 90, '2025-06-01T18:00:00.000Z', 'mantido'],
    );
  });

  it('comment null remove o comentario', async () => {
    const activity = await createActivity({ comment: 'temporario' });

    assert.equal(
      (await patchActivity(activity.id, { comment: null })).json<Activity>().comment,
      null,
    );
  });

  it('tipo inexistente -> 400 e a atividade nao muda', async () => {
    const activity = await createActivity();

    assertValidationError(await patchActivity(activity.id, { activityTypeId: UNKNOWN_ID }));

    const detail = await ctx.request(user, { method: 'GET', url: `/activities/${activity.id}` });

    assert.equal(detail.json<Activity>().activityTypeId, defaultTypeId);
  });

  it('duracao invalida -> 400', async () => {
    const activity = await createActivity();

    assertValidationError(await patchActivity(activity.id, { durationMinutes: 0 }));
  });

  it('photoUrl so aceita null (string -> 400)', async () => {
    const activity = await createActivity();

    assertValidationError(await patchActivity(activity.id, { photoUrl: `/media/${UNKNOWN_ID}` }));
  });

  it('atividade inexistente -> 404', async () => {
    assert.equal((await patchActivity(UNKNOWN_ID, { durationMinutes: 10 })).statusCode, 404);
  });
});

describe('DELETE', () => {
  it('remove: 204, depois detalhe e novo DELETE -> 404', async () => {
    const activity = await createActivity();
    const removed = await ctx.request(user, {
      method: 'DELETE',
      url: `/activities/${activity.id}`,
    });
    const detail = await ctx.request(user, { method: 'GET', url: `/activities/${activity.id}` });
    const again = await ctx.request(user, { method: 'DELETE', url: `/activities/${activity.id}` });

    assert.deepEqual([removed.statusCode, detail.statusCode, again.statusCode], [204, 404, 404]);
  });
});

describe('foto', () => {
  function upload(id: string, payload: object) {
    return ctx.request(user, { method: 'POST', url: `/activities/${id}/photo`, payload });
  }

  it('associa a foto a atividade e o binario e baixavel', async () => {
    const activity = await createActivity();
    const response = await upload(activity.id, { data: PNG_1X1_BASE64, mimeType: 'image/png' });
    const { photoUrl } = response.json<{ photoUrl: string }>();
    const detail = await ctx.request(user, { method: 'GET', url: `/activities/${activity.id}` });
    const bytes = await ctx.request(user, { method: 'GET', url: photoUrl });

    assert.equal(response.statusCode, 200, response.body);
    assert.equal(detail.json<Activity>().photoUrl, photoUrl);
    assert.equal(bytes.statusCode, 200);
    assert.equal(bytes.headers['content-type'], 'image/png');
  });

  it('novo upload substitui a foto anterior', async () => {
    const activity = await createActivity();
    const first = (
      await upload(activity.id, { data: PNG_1X1_BASE64, mimeType: 'image/png' })
    ).json<{ photoUrl: string }>();
    const second = (
      await upload(activity.id, {
        data: `data:image/png;base64,${PNG_1X1_BASE64}`,
        mimeType: 'image/png',
      })
    ).json<{ photoUrl: string }>();
    const detail = await ctx.request(user, { method: 'GET', url: `/activities/${activity.id}` });

    assert.notEqual(second.photoUrl, first.photoUrl);
    assert.equal(detail.json<Activity>().photoUrl, second.photoUrl);
  });

  it('PATCH photoUrl null remove a foto', async () => {
    const activity = await createActivity();

    await upload(activity.id, { data: PNG_1X1_BASE64, mimeType: 'image/png' });

    assert.equal(
      (await patchActivity(activity.id, { photoUrl: null })).json<Activity>().photoUrl,
      null,
    );
  });

  it('MIME fora da lista -> 415', async () => {
    const activity = await createActivity();

    assert.equal(
      (await upload(activity.id, { data: PNG_1X1_BASE64, mimeType: 'image/gif' })).statusCode,
      415,
    );
  });

  it('atividade inexistente -> 404', async () => {
    assert.equal(
      (await upload(UNKNOWN_ID, { data: PNG_1X1_BASE64, mimeType: 'image/png' })).statusCode,
      404,
    );
  });
});

describe('historico (GET /activities)', () => {
  let historyUser: TestUser;

  const listFor = (query: string) =>
    ctx.request(historyUser, { method: 'GET', url: `/activities${query}` });

  before(async () => {
    // Usuario proprio: o historico precisa de um conjunto conhecido de atividades
    historyUser = await ctx.createUser();

    const dates = [
      '2025-01-10T10:00:00.000Z',
      '2025-02-10T10:00:00.000Z',
      '2025-02-20T10:00:00.000Z',
      '2025-03-10T10:00:00.000Z',
    ];

    await dates.reduce(
      (chain, performedAt) =>
        chain.then(async () => {
          await createActivity({ performedAt }, historyUser);
        }),
      Promise.resolve(),
    );
  });

  it('ordena por performedAt desc, nao por data de criacao', async () => {
    // Criada por ultimo, mas com a data mais antiga
    const late = await ctx.createUser();

    await createActivity({ performedAt: '2025-03-01T00:00:00.000Z' }, late);
    await createActivity({ performedAt: '2024-12-01T00:00:00.000Z' }, late);

    const { items } = (await ctx.request(late, { method: 'GET', url: '/activities' })).json<{
      items: Activity[];
    }>();

    assert.deepEqual(
      items.map((item) => item.performedAt),
      ['2025-03-01T00:00:00.000Z', '2024-12-01T00:00:00.000Z'],
    );
  });

  it('from/to sao inclusivos e filtram por performedAt', async () => {
    const response = await listFor('?from=2025-02-10T10:00:00Z&to=2025-02-20T10:00:00Z');

    assert.equal(response.json<{ total: number }>().total, 2);
  });

  it('pagina com total, page e limit', async () => {
    const page2 = (await listFor('?limit=3&page=2')).json<{
      items: Activity[];
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

  const invalidQueries = ['?limit=101', '?limit=0', '?page=0', '?from=ontem'];

  invalidQueries.forEach((query) => {
    it(`query invalida ${query} -> 400`, async () => {
      assertValidationError(await listFor(query));
    });
  });
});
