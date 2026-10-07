import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { prisma } from '../src/shared/db/client.js';
import { createTestContext, type TestContext, type TestUser } from './helpers.js';

/** Reports de exercicios: envio por qualquer usuario e leitura exclusiva do painel admin. */

interface ExerciseReport {
  id: string;
  exerciseId: string;
  text: string;
  createdAt: string;
}

interface AdminExerciseReport {
  id: string;
  exercise: { id: string; name: string; isActive: boolean };
  user: { id: string; email: string; displayName: string | null };
  text: string;
  createdAt: string;
}

interface ReportPage {
  items: AdminExerciseReport[];
  total: number;
  page: number;
  limit: number;
}

let ctx: TestContext;
let user: TestUser;
let admin: TestUser;
let superUser: TestUser;
let exercise: { id: string; name: string };

function report(as: TestUser | null, exerciseId: string, payload: Record<string, unknown>) {
  return ctx.request(as, { method: 'POST', url: `/exercises/${exerciseId}/reports`, payload });
}

/** Lista restrita ao `userId` informado: a tabela e compartilhada com outros testes. */
function list(as: TestUser, query: Record<string, string>) {
  const params = new URLSearchParams(query).toString();

  return ctx.request(as, { method: 'GET', url: `/admin/exercise-reports?${params}` });
}

before(async () => {
  ctx = await createTestContext();
  [user, admin, superUser] = await Promise.all([
    ctx.createUser(),
    ctx.createUser({ role: 'admin' }),
    ctx.createUser({ role: 'super_user' }),
  ]);
  exercise = await prisma.exercise.findFirstOrThrow({ select: { id: true, name: true } });
});

after(async () => {
  await ctx.close();
});

describe('POST /exercises/:id/reports', () => {
  it('cria report com data definida pelo servidor', async () => {
    const startedAt = Date.now();
    const response = await report(user, exercise.id, { text: '  Video mostra outro exercicio ' });

    assert.equal(response.statusCode, 201);
    const body = response.json<ExerciseReport>();

    assert.equal(body.exerciseId, exercise.id);
    assert.equal(body.text, 'Video mostra outro exercicio');
    assert.ok(Date.parse(body.createdAt) >= startedAt - 1000);

    const row = await prisma.exerciseReport.findUniqueOrThrow({ where: { id: body.id } });

    assert.equal(row.userId, user.id);
  });

  it('admin e super_user tambem podem reportar', async () => {
    assert.equal((await report(admin, exercise.id, { text: 'Nome errado' })).statusCode, 201);
    assert.equal((await report(superUser, exercise.id, { text: 'Grupo errado' })).statusCode, 201);
  });

  it('exercicio custom ou inexistente -> 404', async () => {
    const custom = await ctx.request(user, {
      method: 'POST',
      url: '/exercises/custom',
      payload: { name: 'Meu exercicio' },
    });

    assert.equal(
      (await report(user, custom.json<{ id: string }>().id, { text: 'x' })).statusCode,
      404,
    );
    assert.equal((await report(user, randomUUID(), { text: 'x' })).statusCode, 404);
  });

  const invalid: [string, Record<string, unknown>][] = [
    ['sem texto', {}],
    ['texto vazio', { text: '   ' }],
    ['texto longo', { text: 'x'.repeat(2001) }],
  ];

  invalid.forEach(([label, payload]) => {
    it(`rejeita ${label} com 400`, async () => {
      const response = await report(user, exercise.id, payload);

      assert.equal(response.statusCode, 400);
      assert.equal(response.json<{ error: { code: string } }>().error.code, 'VALIDATION_ERROR');
    });
  });

  it('id que nao e uuid -> 400; sem token -> 401', async () => {
    assert.equal((await report(user, 'abc', { text: 'x' })).statusCode, 400);
    assert.equal((await report(null, exercise.id, { text: 'x' })).statusCode, 401);
  });
});

describe('GET /admin/exercise-reports', () => {
  let reporter: TestUser;

  before(async () => {
    reporter = await ctx.createUser();
    // Sequencial para que a ordem por data seja deterministica
    /* eslint-disable no-restricted-syntax, no-await-in-loop */
    for (const text of ['Primeiro', 'Segundo', 'Terceiro']) {
      assert.equal((await report(reporter, exercise.id, { text })).statusCode, 201);
    }
    /* eslint-enable no-restricted-syntax, no-await-in-loop */
  });

  it('user comum recebe 403; sem token 401', async () => {
    assert.equal((await list(user, { userId: reporter.id })).statusCode, 403);
    assert.equal(
      (await ctx.request(null, { method: 'GET', url: '/admin/exercise-reports' })).statusCode,
      401,
    );
  });

  it('admin lista mais recentes primeiro, com exercicio e usuario', async () => {
    const response = await list(admin, { userId: reporter.id });

    assert.equal(response.statusCode, 200);
    const body = response.json<ReportPage>();

    assert.equal(body.total, 3);
    assert.deepEqual(
      body.items.map((item) => item.text),
      ['Terceiro', 'Segundo', 'Primeiro'],
    );
    assert.equal(body.items[0]!.exercise.id, exercise.id);
    assert.equal(body.items[0]!.exercise.name, exercise.name);
    assert.equal(body.items[0]!.user.email, reporter.email);
  });

  it('super_user tambem le', async () => {
    const response = await list(superUser, { userId: reporter.id });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json<ReportPage>().total, 3);
  });

  it('filtra por exercicio, periodo e pagina', async () => {
    const other = (
      await list(admin, { userId: reporter.id, exerciseId: randomUUID() })
    ).json<ReportPage>();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const empty = (await list(admin, { userId: reporter.id, from: future })).json<ReportPage>();
    const page = (
      await list(admin, { userId: reporter.id, page: '2', limit: '2' })
    ).json<ReportPage>();

    assert.equal(other.total, 0);
    assert.equal(empty.total, 0);
    assert.equal(page.items.length, 1);
    assert.equal(page.total, 3);
    assert.equal(page.items[0]!.text, 'Primeiro');
  });
});
