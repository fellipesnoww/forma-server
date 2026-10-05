import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { prisma } from '../src/shared/db/client.js';
import { createTestContext, type TestContext, type TestUser } from './helpers.js';

/** Avaliacoes do app: envio por qualquer usuario e leitura exclusiva do painel admin. */

interface Rating {
  id: string;
  rank: number;
  observation: string | null;
  platform: string;
  device: string;
  date: string;
}

interface AdminRating extends Rating {
  user: { id: string; email: string; displayName: string | null };
}

interface RatingPage {
  items: AdminRating[];
  total: number;
  page: number;
  limit: number;
  averageRank: number | null;
}

let ctx: TestContext;
let user: TestUser;
let admin: TestUser;
let superUser: TestUser;

const SAMPLE = {
  rank: 4,
  observation: 'Gostei do calendario',
  platform: 'mobile',
  device: 'iPhone 15 · iOS 26.1',
};

function create(as: TestUser | null, payload: Record<string, unknown>) {
  return ctx.request(as, { method: 'POST', url: '/ratings', payload });
}

/** Lista restrita ao `userId` informado: a tabela e compartilhada com outros testes e o seed. */
async function list(as: TestUser, query: Record<string, string>) {
  const params = new URLSearchParams(query).toString();

  return ctx.request(as, { method: 'GET', url: `/admin/ratings?${params}` });
}

before(async () => {
  ctx = await createTestContext();
  user = await ctx.createUser();
  admin = await ctx.createUser({ role: 'admin' });
  superUser = await ctx.createUser({ role: 'super_user' });
});

after(async () => {
  await ctx.close();
});

describe('POST /ratings', () => {
  it('cria avaliacao com data definida pelo servidor', async () => {
    const startedAt = Date.now();
    const response = await create(user, SAMPLE);

    assert.equal(response.statusCode, 201);
    const body = response.json<Rating>();

    assert.equal(body.rank, 4);
    assert.equal(body.observation, 'Gostei do calendario');
    assert.equal(body.platform, 'mobile');
    assert.equal(body.device, 'iPhone 15 · iOS 26.1');
    assert.ok(Date.parse(body.date) >= startedAt - 1000);

    const row = await prisma.rating.findUniqueOrThrow({ where: { id: body.id } });

    assert.equal(row.userId, user.id);
  });

  it('admin e super_user tambem podem avaliar', async () => {
    assert.equal((await create(admin, { ...SAMPLE, platform: 'web' })).statusCode, 201);
    assert.equal((await create(superUser, SAMPLE)).statusCode, 201);
  });

  it('observacao e opcional; vazia ou so espacos vira null', async () => {
    const omitted = await create(user, { rank: 5, platform: 'web', device: 'Chrome 140' });
    const blank = await create(user, { ...SAMPLE, observation: '   ' });
    const explicitNull = await create(user, { ...SAMPLE, observation: null });

    assert.equal(omitted.statusCode, 201);
    assert.equal(omitted.json<Rating>().observation, null);
    assert.equal(blank.json<Rating>().observation, null);
    assert.equal(explicitNull.json<Rating>().observation, null);
  });

  const invalid: [string, Record<string, unknown>][] = [
    ['nota 0', { ...SAMPLE, rank: 0 }],
    ['nota 6', { ...SAMPLE, rank: 6 }],
    ['nota fracionada', { ...SAMPLE, rank: 3.5 }],
    ['sem nota', { platform: 'web', device: 'Chrome' }],
    ['plataforma desconhecida', { ...SAMPLE, platform: 'desktop' }],
    ['sem device', { rank: 3, platform: 'web' }],
    ['device vazio', { ...SAMPLE, device: '  ' }],
    ['device longo', { ...SAMPLE, device: 'x'.repeat(121) }],
    ['observacao longa', { ...SAMPLE, observation: 'x'.repeat(2001) }],
  ];

  invalid.forEach(([label, payload]) => {
    it(`rejeita ${label} com 400`, async () => {
      const response = await create(user, payload);

      assert.equal(response.statusCode, 400);
      assert.equal(response.json<{ error: { code: string } }>().error.code, 'VALIDATION_ERROR');
    });
  });

  it('exige autenticacao', async () => {
    assert.equal((await create(null, SAMPLE)).statusCode, 401);
  });

  it('banco recusa nota fora de 1–5 mesmo sem passar pela API', async () => {
    await assert.rejects(
      prisma.rating.create({
        data: { userId: user.id, rank: 7, platform: 'web', device: 'Chrome' },
      }),
    );
  });
});

describe('GET /admin/ratings', () => {
  let reviewer: TestUser;

  before(async () => {
    reviewer = await ctx.createUser();
    // Sequencial para que a ordem por data seja deterministica
    /* eslint-disable no-restricted-syntax, no-await-in-loop */
    for (const payload of [
      { rank: 2, platform: 'web', device: 'Firefox 140', observation: 'Lento' },
      { rank: 5, platform: 'mobile', device: 'Pixel 9' },
      { rank: 4, platform: 'mobile', device: 'Pixel 9' },
    ]) {
      assert.equal((await create(reviewer, payload)).statusCode, 201);
    }
    /* eslint-enable no-restricted-syntax, no-await-in-loop */
  });

  it('user comum recebe 403', async () => {
    const response = await list(user, { userId: reviewer.id });

    assert.equal(response.statusCode, 403);
  });

  it('exige autenticacao', async () => {
    const response = await ctx.request(null, { method: 'GET', url: '/admin/ratings' });

    assert.equal(response.statusCode, 401);
  });

  it('admin lista mais recentes primeiro, com usuario e media do filtro', async () => {
    const response = await list(admin, { userId: reviewer.id });

    assert.equal(response.statusCode, 200);
    const body = response.json<RatingPage>();

    assert.equal(body.total, 3);
    assert.deepEqual(
      body.items.map((item) => item.rank),
      [4, 5, 2],
    );
    assert.equal(body.items[0]!.user.id, reviewer.id);
    assert.equal(body.items[0]!.user.email, reviewer.email);
    assert.equal(body.averageRank, 3.67);
  });

  it('super_user tambem le', async () => {
    const response = await list(superUser, { userId: reviewer.id });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json<RatingPage>().total, 3);
  });

  it('filtra por plataforma e nota', async () => {
    const mobile = (
      await list(admin, { userId: reviewer.id, platform: 'mobile' })
    ).json<RatingPage>();
    const rankTwo = (await list(admin, { userId: reviewer.id, rank: '2' })).json<RatingPage>();

    assert.equal(mobile.total, 2);
    assert.equal(mobile.averageRank, 4.5);
    assert.equal(rankTwo.total, 1);
    assert.equal(rankTwo.items[0]!.observation, 'Lento');
  });

  it('pagina sem perder o total e a media do filtro inteiro', async () => {
    const body = (
      await list(admin, { userId: reviewer.id, page: '2', limit: '2' })
    ).json<RatingPage>();

    assert.equal(body.items.length, 1);
    assert.equal(body.total, 3);
    assert.equal(body.page, 2);
    assert.equal(body.averageRank, 3.67);
  });

  it('filtra por periodo; sem linhas a media e null', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const body = (await list(admin, { userId: reviewer.id, from: future })).json<RatingPage>();

    assert.equal(body.total, 0);
    assert.equal(body.averageRank, null);
  });

  it('usuario sem avaliacoes devolve lista vazia', async () => {
    const body = (await list(admin, { userId: randomUUID() })).json<RatingPage>();

    assert.deepEqual(body.items, []);
  });

  it('rejeita filtros invalidos com 400', async () => {
    assert.equal((await list(admin, { rank: '9' })).statusCode, 400);
    assert.equal((await list(admin, { platform: 'tv' })).statusCode, 400);
  });
});
