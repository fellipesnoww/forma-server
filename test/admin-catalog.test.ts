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

interface AdminExercise {
  id: string;
  name: string;
  muscleGroup: { id: string; slug: string; name: string } | null;
  isActive: boolean;
  mediaUrl: string | null;
}

interface MuscleGroup {
  id: string;
  slug: string;
  name: string;
  exerciseCount: number;
}

let ctx: TestContext;
let admin: TestUser;
let user: TestUser;

/** Prefixo unico: isola o que este arquivo cria no catalogo global e permite limpar no fim. */
const TAG = `zz-test-${randomUUID().slice(0, 8)}`;

before(async () => {
  ctx = await createTestContext();
  [admin, user] = await Promise.all([ctx.createUser({ role: 'admin' }), ctx.createUser()]);
});

after(async () => {
  const exercises = await prisma.exercise.findMany({ where: { name: { startsWith: TAG } } });
  const mediaIds = exercises.flatMap((e) => (e.mediaUrl ? [mediaIdFromUrl(e.mediaUrl)] : []));
  const exerciseIds = exercises.map((e) => e.id);

  await prisma.adminAuditLog.deleteMany({ where: { actorId: admin.id } });
  await prisma.sheetExercise.deleteMany({ where: { exerciseId: { in: exerciseIds } } });
  await prisma.exercise.deleteMany({ where: { id: { in: exerciseIds } } });
  await prisma.muscleGroup.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.mediaAsset.deleteMany({ where: { id: { in: mediaIds } } });
  await ctx.close();
});

function createExercise(payload: Record<string, unknown>) {
  return ctx.request(admin, { method: 'POST', url: '/admin/exercises', payload });
}

function createGroup(payload: Record<string, unknown>) {
  return ctx.request(admin, { method: 'POST', url: '/admin/muscle-groups', payload });
}

describe('grupos musculares', () => {
  it('cria com slug derivado do nome (sem acento, kebab-case) e audit log', async () => {
    const response = await createGroup({ name: `${TAG} Glúteo Médio` });
    const group = response.json<MuscleGroup>();

    assert.equal(response.statusCode, 201);
    assert.equal(group.slug, `${TAG}-gluteo-medio`);
    assert.equal(group.exerciseCount, 0);

    const [log] = await auditLogsFor(group.id);
    assert.equal(log?.action, 'muscle_group.created');
  });

  it('nome repetido (sem diferenciar maiusculas) ou slug repetido -> 409', async () => {
    await createGroup({ name: `${TAG} Serratil`, slug: `${TAG}-serratil` });

    assert.equal((await createGroup({ name: `${TAG} SERRATIL` })).statusCode, 409);
    assert.equal(
      (await createGroup({ name: `${TAG} Outro`, slug: `${TAG}-serratil` })).statusCode,
      409,
    );
  });

  it('slug fora do padrao -> 400', async () => {
    const response = await createGroup({ name: `${TAG} X`, slug: 'Com Espaco' });

    assert.equal(response.statusCode, 400);
  });

  it('PATCH renomeia e troca slug; lista traz contagem de exercicios', async () => {
    const group = (await createGroup({ name: `${TAG} Adutores` })).json<MuscleGroup>();

    await createExercise({ name: `${TAG} Cadeira adutora`, muscleGroupSlug: group.slug });

    const patched = await ctx.request(admin, {
      method: 'PATCH',
      url: `/admin/muscle-groups/${group.id}`,
      payload: { name: `${TAG} Adutores da coxa`, slug: `${TAG}-adutores-coxa` },
    });

    assert.equal(patched.statusCode, 200);
    assert.equal(patched.json<MuscleGroup>().slug, `${TAG}-adutores-coxa`);

    const list = await ctx.request(admin, { method: 'GET', url: '/admin/muscle-groups' });
    const listed = list.json<{ items: MuscleGroup[] }>().items.find((g) => g.id === group.id);

    assert.equal(listed?.exerciseCount, 1);
    assert.ok(list.json<{ items: MuscleGroup[] }>().items.length >= 12, 'seed + criados');
  });

  it('PATCH vazio -> 400; inexistente -> 404', async () => {
    const group = (await createGroup({ name: `${TAG} Vazio` })).json<MuscleGroup>();

    assert.equal(
      (
        await ctx.request(admin, {
          method: 'PATCH',
          url: `/admin/muscle-groups/${group.id}`,
          payload: {},
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await ctx.request(admin, {
          method: 'PATCH',
          url: `/admin/muscle-groups/${randomUUID()}`,
          payload: { name: 'x' },
        })
      ).statusCode,
      404,
    );
  });
});

describe('POST /admin/exercises', () => {
  it('cria com grupo e midia; midia global e legivel por usuario comum', async () => {
    const response = await createExercise({
      name: `${TAG} Supino com corrente`,
      muscleGroupSlug: 'peito',
      media: { data: PNG_1X1_BASE64, mimeType: 'image/png', filename: 'supino.png' },
    });
    const exercise = response.json<AdminExercise>();

    assert.equal(response.statusCode, 201);
    assert.equal(exercise.muscleGroup?.slug, 'peito');
    assert.equal(exercise.isActive, true);
    assert.ok(exercise.mediaUrl);

    const media = await ctx.request(user, {
      method: 'GET',
      url: `/media/${mediaIdFromUrl(exercise.mediaUrl)}`,
    });
    assert.equal(media.statusCode, 200);
    assert.equal(media.headers['content-type'], 'image/png');

    const [log] = await auditLogsFor(exercise.id);
    assert.equal(log?.action, 'exercise.created');
    assert.equal(log?.actorId, admin.id);
  });

  it('aparece no catalogo do usuario (GET /exercises)', async () => {
    const created = (await createExercise({ name: `${TAG} Remada visivel` })).json<AdminExercise>();
    const catalog = await ctx.request(user, {
      method: 'GET',
      url: `/exercises?q=${encodeURIComponent(`${TAG} Remada`)}`,
    });

    assert.ok(
      catalog.json<{ items: { id: string }[] }>().items.some((item) => item.id === created.id),
    );
  });

  it('nome ja existente (sem diferenciar maiusculas) -> 409 sem audit log', async () => {
    await createExercise({ name: `${TAG} Agachamento X` });

    const logCount = await prisma.adminAuditLog.count({ where: { actorId: admin.id } });
    const response = await createExercise({ name: `${TAG} AGACHAMENTO x` });

    assert.equal(response.statusCode, 409);
    assert.equal(await prisma.adminAuditLog.count({ where: { actorId: admin.id } }), logCount);
  });

  it('grupo inexistente -> 400; nome vazio -> 400; MIME invalido -> 415', async () => {
    assert.equal(
      (await createExercise({ name: `${TAG} Y`, muscleGroupSlug: 'nao-existe' })).statusCode,
      400,
    );
    assert.equal((await createExercise({ name: '  ' })).statusCode, 400);
    assert.equal(
      (
        await createExercise({
          name: `${TAG} Z`,
          media: { data: Buffer.from('texto').toString('base64'), mimeType: 'text/plain' },
        })
      ).statusCode,
      415,
    );
  });

  it('pode nascer inativo', async () => {
    const response = await createExercise({ name: `${TAG} Rascunho`, isActive: false });

    assert.equal(response.json<AdminExercise>().isActive, false);
  });
});

describe('GET /admin/exercises', () => {
  it('inclui inativos por padrao e filtra por status, grupo e busca', async () => {
    const active = (
      await createExercise({ name: `${TAG} Lista ativo`, muscleGroupSlug: 'costas' })
    ).json<AdminExercise>();
    const inactive = (
      await createExercise({ name: `${TAG} Lista inativo`, isActive: false })
    ).json<AdminExercise>();

    const all = await ctx.request(admin, {
      method: 'GET',
      url: `/admin/exercises?q=${encodeURIComponent(`${TAG} Lista`)}`,
    });
    const onlyInactive = await ctx.request(admin, {
      method: 'GET',
      url: `/admin/exercises?q=${encodeURIComponent(`${TAG} Lista`)}&status=inactive`,
    });
    const byGroup = await ctx.request(admin, {
      method: 'GET',
      url: `/admin/exercises?q=${encodeURIComponent(`${TAG} Lista`)}&muscleGroup=costas`,
    });

    const ids = (r: typeof all) => r.json<{ items: AdminExercise[] }>().items.map((e) => e.id);

    assert.deepEqual(ids(all).sort(), [active.id, inactive.id].sort());
    assert.deepEqual(ids(onlyInactive), [inactive.id]);
    assert.deepEqual(ids(byGroup), [active.id]);
  });

  it('paginacao { items, total, page, limit }', async () => {
    const response = await ctx.request(admin, {
      method: 'GET',
      url: '/admin/exercises?page=2&limit=5',
    });
    const body = response.json<{ items: unknown[]; total: number; page: number; limit: number }>();

    assert.equal(response.statusCode, 200);
    assert.equal(body.page, 2);
    assert.equal(body.limit, 5);
    assert.equal(body.items.length, 5);
    assert.ok(body.total > 10, 'catalogo do seed');
  });
});

describe('PATCH /admin/exercises/:id', () => {
  it('renomeia, troca grupo e grava antes/depois no audit log', async () => {
    const created = (
      await createExercise({ name: `${TAG} Rosca antiga`, muscleGroupSlug: 'biceps' })
    ).json<AdminExercise>();

    const response = await ctx.request(admin, {
      method: 'PATCH',
      url: `/admin/exercises/${created.id}`,
      payload: { name: `${TAG} Rosca nova`, muscleGroupSlug: 'antebraco' },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json<AdminExercise>().muscleGroup?.slug, 'antebraco');

    const [log] = await auditLogsFor(created.id);
    const metadata = log?.metadata as { before: { name: string }; after: { name: string } };

    assert.equal(log?.action, 'exercise.updated');
    assert.equal(metadata.before.name, `${TAG} Rosca antiga`);
    assert.equal(metadata.after.name, `${TAG} Rosca nova`);
  });

  it('muscleGroupSlug null remove o grupo; mediaUrl null remove a midia', async () => {
    const created = (
      await createExercise({
        name: `${TAG} Com midia`,
        muscleGroupSlug: 'ombros',
        media: { data: PNG_1X1_BASE64, mimeType: 'image/png' },
      })
    ).json<AdminExercise>();

    const response = await ctx.request(admin, {
      method: 'PATCH',
      url: `/admin/exercises/${created.id}`,
      payload: { muscleGroupSlug: null, mediaUrl: null },
    });

    assert.equal(response.json<AdminExercise>().muscleGroup, null);
    assert.equal(response.json<AdminExercise>().mediaUrl, null);
  });

  it('media + mediaUrl null juntos -> 400; vazio -> 400; nome de outro -> 409; inexistente -> 404', async () => {
    const a = (await createExercise({ name: `${TAG} Patch A` })).json<AdminExercise>();
    await createExercise({ name: `${TAG} Patch B` });

    const patch = (id: string, payload: Record<string, unknown>) =>
      ctx.request(admin, { method: 'PATCH', url: `/admin/exercises/${id}`, payload });

    assert.equal(
      (
        await patch(a.id, {
          media: { data: PNG_1X1_BASE64, mimeType: 'image/png' },
          mediaUrl: null,
        })
      ).statusCode,
      400,
    );
    assert.equal((await patch(a.id, {})).statusCode, 400);
    assert.equal((await patch(a.id, { name: `${TAG} patch b` })).statusCode, 409);
    assert.equal((await patch(a.id, { name: `${TAG} Patch A` })).statusCode, 200, 'proprio nome');
    assert.equal((await patch(randomUUID(), { name: 'x' })).statusCode, 404);
  });
});

describe('PATCH /admin/exercises/:id/status', () => {
  it('desativar tira do catalogo e bloqueia novas referencias; planilha existente segue valida', async () => {
    const created = (await createExercise({ name: `${TAG} Desativavel` })).json<AdminExercise>();

    const sheet = await ctx.request(user, {
      method: 'POST',
      url: '/workout-sheets',
      payload: {
        name: 'Planilha antes da desativacao',
        days: [{ weekday: 1, order: 0, exercises: [{ exerciseId: created.id, sortOrder: 0 }] }],
      },
    });
    assert.equal(sheet.statusCode, 201);

    const response = await ctx.request(admin, {
      method: 'PATCH',
      url: `/admin/exercises/${created.id}/status`,
      payload: { isActive: false },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json<AdminExercise>().isActive, false);

    const catalog = await ctx.request(user, {
      method: 'GET',
      url: `/exercises?q=${encodeURIComponent(`${TAG} Desativavel`)}`,
    });
    assert.deepEqual(catalog.json<{ items: unknown[] }>().items, []);

    const newSheet = await ctx.request(user, {
      method: 'POST',
      url: '/workout-sheets',
      payload: {
        name: 'Planilha depois',
        days: [{ weekday: 2, order: 0, exercises: [{ exerciseId: created.id, sortOrder: 0 }] }],
      },
    });
    assert.equal(newSheet.statusCode, 400);

    const oldSheet = await ctx.request(user, {
      method: 'GET',
      url: `/workout-sheets/${sheet.json<{ id: string }>().id}`,
    });
    assert.equal(oldSheet.statusCode, 200);

    const [log] = await auditLogsFor(created.id);
    assert.equal(log?.action, 'exercise.status_changed');
    assert.deepEqual(log?.metadata, { from: true, to: false });
  });

  it('status igual ao atual -> 200 sem novo audit log', async () => {
    const created = (await createExercise({ name: `${TAG} Ja ativo` })).json<AdminExercise>();
    const response = await ctx.request(admin, {
      method: 'PATCH',
      url: `/admin/exercises/${created.id}/status`,
      payload: { isActive: true },
    });

    assert.equal(response.statusCode, 200);
    assert.equal((await auditLogsFor(created.id)).length, 1, 'so o exercise.created');
  });

  it('corpo invalido -> 400; inexistente -> 404', async () => {
    const statusOf = (id: string, payload: unknown) =>
      ctx.request(admin, {
        method: 'PATCH',
        url: `/admin/exercises/${id}/status`,
        payload: payload as Record<string, unknown>,
      });

    assert.equal((await statusOf(randomUUID(), { isActive: 'nao' })).statusCode, 400);
    assert.equal((await statusOf(randomUUID(), { isActive: false })).statusCode, 404);
  });
});
