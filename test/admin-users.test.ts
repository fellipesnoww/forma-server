import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { prisma } from '../src/shared/db/client.js';
import {
  auditLogsFor,
  createTestContext,
  type AuditLogItem,
  type TestContext,
  type TestUser,
} from './helpers.js';

interface UserSummary {
  id: string;
  email: string;
  role: string;
  status: string;
  displayName: string | null;
  lastActivityAt: string | null;
}

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

let ctx: TestContext;
let admin: TestUser;
let superUser: TestUser;

before(async () => {
  ctx = await createTestContext();
  [admin, superUser] = await Promise.all([
    ctx.createUser({ role: 'admin' }),
    ctx.createUser({ role: 'super_user' }),
  ]);
});

after(async () => {
  await ctx.close();
});

function patchStatus(actor: TestUser, targetId: string, status: string, reason?: string) {
  return ctx.request(actor, {
    method: 'PATCH',
    url: `/admin/users/${targetId}/status`,
    payload: { status, ...(reason ? { reason } : {}) },
  });
}

describe('GET /admin/users', () => {
  it('busca por email e por nome de exibicao, com paginacao', async () => {
    const target = await ctx.createUser();
    const tag = randomUUID().slice(0, 8);

    await prisma.userProfile.update({
      where: { userId: target.id },
      data: { displayName: `Fulana ${tag}` },
    });

    const byName = await ctx.request(admin, {
      method: 'GET',
      url: `/admin/users?q=${encodeURIComponent(`fulana ${tag}`)}`,
    });
    const byEmail = await ctx.request(admin, {
      method: 'GET',
      url: `/admin/users?q=${encodeURIComponent(target.email.toUpperCase())}`,
    });

    assert.equal(byName.statusCode, 200);
    assert.deepEqual(
      byName.json<Page<UserSummary>>().items.map((item) => item.id),
      [target.id],
    );
    assert.equal(byName.json<Page<UserSummary>>().items[0]!.displayName, `Fulana ${tag}`);
    assert.deepEqual(
      byEmail.json<Page<UserSummary>>().items.map((item) => item.id),
      [target.id],
    );
  });

  it('filtros role/status e formato { items, total, page, limit }', async () => {
    const banned = await ctx.createUser({ status: 'banned' });
    const response = await ctx.request(admin, {
      method: 'GET',
      url: '/admin/users?status=banned&role=user&limit=100',
    });
    const body = response.json<Page<UserSummary>>();

    assert.equal(response.statusCode, 200);
    assert.equal(body.page, 1);
    assert.equal(body.limit, 100);
    assert.ok(body.total >= 1);
    assert.ok(body.items.some((item) => item.id === banned.id));
    assert.ok(body.items.every((item) => item.status === 'banned' && item.role === 'user'));
  });

  it('nunca expoe passwordHash nem tokenVersion', async () => {
    const response = await ctx.request(admin, { method: 'GET', url: '/admin/users?limit=5' });

    assert.doesNotMatch(response.body, /passwordHash|password_hash|tokenVersion/);
  });

  ['?status=deleted', '?role=root', '?limit=101', '?page=0'].forEach((query) => {
    it(`query invalida ${query} -> 400`, async () => {
      const response = await ctx.request(admin, { method: 'GET', url: `/admin/users${query}` });

      assert.equal(response.statusCode, 400);
    });
  });
});

describe('lastActivityAt ("ultimo treino")', () => {
  async function seedHistory(userId: string) {
    const type = await prisma.activityType.findFirstOrThrow({ where: { userId: null } });
    const sheet = await prisma.workoutSheet.create({ data: { userId, name: 'Planilha admin' } });

    await prisma.workoutSession.create({
      data: { userId, sheetId: sheet.id, performedAt: new Date('2026-08-20T10:00:00Z') },
    });
    await prisma.freeActivity.create({
      data: {
        userId,
        activityTypeId: type.id,
        durationMinutes: 30,
        performedAt: new Date('2026-08-10T10:00:00Z'),
      },
    });
  }

  it('listagem traz o performedAt mais recente entre sessoes e atividades; null sem historico', async () => {
    const [active, idle] = await Promise.all([ctx.createUser(), ctx.createUser()]);
    await seedHistory(active.id);

    const page = async (email: string) =>
      (await ctx.request(admin, { method: 'GET', url: `/admin/users?q=${email}` })).json<
        Page<UserSummary>
      >().items[0];

    assert.equal((await page(active.email))?.lastActivityAt, '2026-08-20T10:00:00.000Z');
    assert.equal((await page(idle.email))?.lastActivityAt, null);
  });

  it('respostas de PATCH status tambem trazem o campo', async () => {
    const target = await ctx.createUser();
    await seedHistory(target.id);

    const response = await patchStatus(admin, target.id, 'inactive');

    assert.equal(response.statusCode, 200);
    assert.equal(response.json<UserSummary>().lastActivityAt, '2026-08-20T10:00:00.000Z');
  });
});

describe('GET /admin/users/:id', () => {
  it('perfil + estatisticas de uso', async () => {
    const target = await ctx.createUser();
    const type = await prisma.activityType.findFirstOrThrow({ where: { userId: null } });
    const performedAt = new Date('2026-09-01T10:00:00Z');

    await prisma.freeActivity.create({
      data: { userId: target.id, activityTypeId: type.id, durationMinutes: 30, performedAt },
    });

    const response = await ctx.request(admin, { method: 'GET', url: `/admin/users/${target.id}` });
    const body = response.json<{
      email: string;
      authMethods: { password: boolean; oauthProvider: string | null };
      profile: { timezone: string };
      stats: Record<string, number | string | null>;
    }>();

    assert.equal(response.statusCode, 200);
    assert.equal(body.email, target.email);
    assert.deepEqual(body.authMethods, { password: false, oauthProvider: null });
    assert.equal(body.profile.timezone, 'America/Sao_Paulo');
    assert.equal(body.stats.freeActivities, 1);
    assert.equal(body.stats.workoutSessions, 0);
    assert.equal(body.stats.lastActivityAt, performedAt.toISOString());
    assert.equal(
      response.json<UserSummary>().lastActivityAt,
      performedAt.toISOString(),
      'resumo e stats concordam',
    );
  });

  it('inexistente -> 404', async () => {
    const response = await ctx.request(admin, {
      method: 'GET',
      url: `/admin/users/${randomUUID()}`,
    });

    assert.equal(response.statusCode, 404);
  });
});

describe('PATCH /admin/users/:id/status', () => {
  it('admin bane user: conta cai na hora, refresh invalidado e audit log gravado', async () => {
    const target = await ctx.createUser();
    const beforeRow = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });

    const response = await patchStatus(admin, target.id, 'banned', 'spam');

    assert.equal(response.statusCode, 200);
    assert.equal(response.json<UserSummary>().status, 'banned');
    assert.equal((await ctx.request(target, { method: 'GET', url: '/auth/me' })).statusCode, 403);

    const afterRow = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(afterRow.tokenVersion, beforeRow.tokenVersion + 1);

    const [log] = await auditLogsFor(target.id);
    assert.equal(log?.action, 'user.status_changed');
    assert.equal(log?.actorId, admin.id);
    assert.deepEqual(log?.metadata, {
      from: 'active',
      to: 'banned',
      targetRole: 'user',
      reason: 'spam',
    });
  });

  it('reativar nao incrementa tokenVersion de novo', async () => {
    const target = await ctx.createUser({ status: 'inactive' });
    const beforeRow = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });

    assert.equal((await patchStatus(admin, target.id, 'active')).statusCode, 200);

    const afterRow = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(afterRow.tokenVersion, beforeRow.tokenVersion);
    assert.equal((await ctx.request(target, { method: 'GET', url: '/auth/me' })).statusCode, 200);
  });

  it('repetir o status atual e no-op sem audit log', async () => {
    const target = await ctx.createUser();
    const response = await patchStatus(admin, target.id, 'active');

    assert.equal(response.statusCode, 200);
    assert.deepEqual(await auditLogsFor(target.id), []);
  });

  (['admin', 'super_user'] as const).forEach((role) => {
    it(`admin NAO altera conta ${role} -> 403 sem audit log`, async () => {
      const target = await ctx.createUser({ role });
      const response = await patchStatus(admin, target.id, 'banned');

      assert.equal(response.statusCode, 403);
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status,
        'active',
      );
      assert.deepEqual(await auditLogsFor(target.id), []);
    });

    it(`super_user altera conta ${role}`, async () => {
      const target = await ctx.createUser({ role });
      const response = await patchStatus(superUser, target.id, 'inactive');

      assert.equal(response.statusCode, 200);
      assert.equal((await auditLogsFor(target.id)).length, 1);
    });
  });

  it('alterar a propria conta -> 403', async () => {
    const own = await patchStatus(admin, admin.id, 'inactive');
    const ownSuper = await patchStatus(superUser, superUser.id, 'banned');

    assert.equal(own.statusCode, 403);
    assert.equal(ownSuper.statusCode, 403);
  });

  it('inexistente -> 404; status invalido -> 400', async () => {
    assert.equal((await patchStatus(admin, randomUUID(), 'banned')).statusCode, 404);
    assert.equal((await patchStatus(admin, admin.id, 'deleted')).statusCode, 400);
  });
});

describe('PATCH /admin/users/:id/role (super_user)', () => {
  function promote(actor: TestUser, targetId: string, role = 'admin') {
    return ctx.request(actor, {
      method: 'PATCH',
      url: `/admin/users/${targetId}/role`,
      payload: { role },
    });
  }

  it('promove user -> admin, com audit log; o promovido ja acessa /admin', async () => {
    const target = await ctx.createUser();
    const response = await promote(superUser, target.id);

    assert.equal(response.statusCode, 200);
    assert.equal(response.json<UserSummary>().role, 'admin');
    assert.equal(
      (await ctx.request(target, { method: 'GET', url: '/admin/users' })).statusCode,
      200,
    );

    const [log] = await auditLogsFor(target.id);
    assert.equal(log?.action, 'user.role_changed');
    assert.deepEqual(log?.metadata, { from: 'user', to: 'admin' });
  });

  it('admin tentando promover -> 403 (escalada bloqueada), sem efeito', async () => {
    const target = await ctx.createUser();
    const response = await promote(admin, target.id);

    assert.equal(response.statusCode, 403);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).role, 'user');
  });

  it('admin nao se promove a super_user por nenhuma rota', async () => {
    const viaUsers = await promote(admin, admin.id, 'super_user');
    const viaAdmins = await ctx.request(admin, {
      method: 'PATCH',
      url: `/admin/admins/${admin.id}/role`,
      payload: { role: 'super_user' },
    });

    assert.equal(viaUsers.statusCode, 403);
    assert.equal(viaAdmins.statusCode, 403);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).role, 'admin');
  });

  it('role diferente de admin -> 400 (rota so promove)', async () => {
    const target = await ctx.createUser();

    assert.equal((await promote(superUser, target.id, 'super_user')).statusCode, 400);
    assert.equal((await promote(superUser, target.id, 'user')).statusCode, 400);
  });

  it('alvo super_user -> 409; ja admin -> no-op sem audit log', async () => {
    const targetSuper = await ctx.createUser({ role: 'super_user' });
    const targetAdmin = await ctx.createUser({ role: 'admin' });

    assert.equal((await promote(superUser, targetSuper.id)).statusCode, 409);
    assert.equal((await promote(superUser, targetAdmin.id)).statusCode, 200);
    assert.deepEqual(await auditLogsFor(targetAdmin.id), []);
  });

  it('conta nao ativa -> 409', async () => {
    const target = await ctx.createUser({ status: 'banned' });

    assert.equal((await promote(superUser, target.id)).statusCode, 409);
  });
});

describe('/admin/admins (super_user)', () => {
  function setRole(actor: TestUser, targetId: string, role: string) {
    return ctx.request(actor, {
      method: 'PATCH',
      url: `/admin/admins/${targetId}/role`,
      payload: { role },
    });
  }

  it('GET lista so admin e super_user', async () => {
    const response = await ctx.request(superUser, {
      method: 'GET',
      url: '/admin/admins?limit=100',
    });
    const body = response.json<Page<UserSummary>>();

    assert.equal(response.statusCode, 200);
    assert.ok(body.items.some((item) => item.id === admin.id));
    assert.ok(body.items.some((item) => item.id === superUser.id));
    assert.ok(body.items.every((item) => item.role === 'admin' || item.role === 'super_user'));
  });

  it('GET ?role=super_user filtra', async () => {
    const response = await ctx.request(superUser, {
      method: 'GET',
      url: '/admin/admins?role=super_user&limit=100',
    });

    assert.ok(response.json<Page<UserSummary>>().items.every((item) => item.role === 'super_user'));
  });

  it('promove admin -> super_user e rebaixa de volta, com dois audit logs', async () => {
    const target = await ctx.createUser({ role: 'admin' });

    assert.equal((await setRole(superUser, target.id, 'super_user')).statusCode, 200);
    assert.equal(
      (await ctx.request(target, { method: 'GET', url: '/admin/audit-logs' })).statusCode,
      200,
    );
    assert.equal((await setRole(superUser, target.id, 'admin')).statusCode, 200);
    assert.equal(
      (await ctx.request(target, { method: 'GET', url: '/admin/audit-logs' })).statusCode,
      403,
    );

    const logs = await auditLogsFor(target.id);
    assert.deepEqual(
      logs.map((log) => log.metadata),
      [
        { from: 'super_user', to: 'admin' },
        { from: 'admin', to: 'super_user' },
      ],
    );
  });

  it('revoga acesso admin (role=user): perde /admin no proximo request', async () => {
    const target = await ctx.createUser({ role: 'admin' });

    assert.equal((await setRole(superUser, target.id, 'user')).statusCode, 200);
    assert.equal(
      (await ctx.request(target, { method: 'GET', url: '/admin/users' })).statusCode,
      403,
    );
  });

  it('alvo que nao e admin -> 404; inexistente -> 404', async () => {
    const plain = await ctx.createUser();

    assert.equal((await setRole(superUser, plain.id, 'admin')).statusCode, 404);
    assert.equal((await setRole(superUser, randomUUID(), 'admin')).statusCode, 404);
  });

  it('super_user nao altera o proprio papel -> 403', async () => {
    const response = await setRole(superUser, superUser.id, 'admin');

    assert.equal(response.statusCode, 403);
  });

  it('admin -> 403 em GET e PATCH', async () => {
    const target = await ctx.createUser({ role: 'admin' });

    assert.equal(
      (await ctx.request(admin, { method: 'GET', url: '/admin/admins' })).statusCode,
      403,
    );
    assert.equal((await setRole(admin, target.id, 'user')).statusCode, 403);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).role, 'admin');
  });
});

describe('GET /admin/audit-logs (super_user)', () => {
  it('filtra por actorId, action e targetId; inclui ator e ordena desc', async () => {
    const actor = await ctx.createUser({ role: 'admin' });
    const targets = await Promise.all([ctx.createUser(), ctx.createUser()]);

    await patchStatus(actor, targets[0].id, 'inactive');
    await patchStatus(actor, targets[1].id, 'banned');

    const response = await ctx.request(superUser, {
      method: 'GET',
      url: `/admin/audit-logs?actorId=${actor.id}&action=user.status_changed`,
    });
    const body = response.json<Page<AuditLogItem>>();

    assert.equal(response.statusCode, 200);
    assert.equal(body.total, 2);
    assert.deepEqual(
      body.items.map((item) => item.targetId),
      [targets[1].id, targets[0].id],
    );
    assert.deepEqual(body.items[0]!.actor, { id: actor.id, email: actor.email });

    const byTarget = await ctx.request(superUser, {
      method: 'GET',
      url: `/admin/audit-logs?targetType=user&targetId=${targets[0].id}`,
    });
    assert.equal(byTarget.json<Page<AuditLogItem>>().total, 1);
  });

  it('from/to delimitam createdAt', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const response = await ctx.request(superUser, {
      method: 'GET',
      url: `/admin/audit-logs?from=${encodeURIComponent(future)}`,
    });

    assert.equal(response.json<Page<AuditLogItem>>().total, 0);
  });

  it('action fora do catalogo -> 400', async () => {
    const response = await ctx.request(superUser, {
      method: 'GET',
      url: '/admin/audit-logs?action=user.deleted',
    });

    assert.equal(response.statusCode, 400);
  });
});

describe('GET /admin/audit-logs/export (super_user)', () => {
  function exportCsv(actor: TestUser, query: string) {
    return ctx.request(actor, { method: 'GET', url: `/admin/audit-logs/export${query}` });
  }

  it('CSV com os mesmos filtros da listagem, mais recentes primeiro', async () => {
    const actor = await ctx.createUser({ role: 'admin' });
    const targets = await Promise.all([ctx.createUser(), ctx.createUser()]);

    await patchStatus(actor, targets[0].id, 'inactive', 'motivo, com "aspas"');
    await patchStatus(actor, targets[1].id, 'banned');

    const response = await exportCsv(superUser, `?actorId=${actor.id}`);
    const [header, ...rows] = response.body
      .replace(/^\uFEFF/, '')
      .trimEnd()
      .split('\r\n');

    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers['content-type']), /^text\/csv/);
    assert.match(
      String(response.headers['content-disposition']),
      /attachment; filename="audit-logs-/,
    );
    assert.equal(response.headers['x-total-count'], '2');
    assert.equal(response.headers['x-export-truncated'], 'false');
    assert.ok(response.body.startsWith('\uFEFF'), 'BOM para o Excel reconhecer UTF-8');
    assert.equal(header, 'createdAt,actorId,actorEmail,action,targetType,targetId,metadata');
    assert.equal(rows.length, 2);
    assert.ok(rows[0]!.includes(targets[1].id), 'mais recente primeiro');
    assert.ok(rows[0]!.includes(`${actor.id},${actor.email},user.status_changed,user`));
    // metadata em JSON: aspas duplicadas e celula entre aspas por causa das virgulas
    assert.ok(rows[1]!.includes('motivo, com \\""aspas\\""'), rows[1]);
  });

  it('filtro sem resultado: so o cabecalho', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const response = await exportCsv(superUser, `?from=${encodeURIComponent(future)}`);

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['x-total-count'], '0');
    assert.equal(
      response.body
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n').length,
      1,
    );
  });

  it('admin -> 403; query invalida -> 400', async () => {
    assert.equal((await exportCsv(admin, '')).statusCode, 403);
    assert.equal((await exportCsv(superUser, '?action=user.deleted')).statusCode, 400);
    assert.equal((await exportCsv(superUser, '?page=2')).statusCode, 200, 'paginacao ignorada');
  });
});
