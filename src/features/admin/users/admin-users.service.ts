import { hasRole, type Role } from '../../../shared/auth/index.js';
import { prisma, type TransactionClient } from '../../../shared/db/client.js';
import { AppError } from '../../../shared/errors/index.js';
import type { UserStatus } from '../../../generated/prisma/client.js';
import type { AdminActor, Page } from '../admin.schemas.js';
import { runAudited } from '../audit/audit.service.js';
import {
  findUserDetail,
  findUserSummary,
  lastActivityByUser,
  listUsers,
  lockUser,
  updateUserAccess,
  userStats,
  type UserSummaryRow,
} from './admin-users.repository.js';
import type {
  AdminUserDetail,
  AdminUserSummary,
  ListAdminsQuery,
  ListUsersQuery,
} from './admin-users.schemas.js';

const ADMIN_ROLES: Role[] = ['admin', 'super_user'];

function toSummary(row: UserSummaryRow, lastActivityAt: Date | null): AdminUserSummary {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    displayName: row.profile?.displayName ?? null,
    avatarUrl: row.profile?.avatarUrl ?? null,
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: lastActivityAt?.toISOString() ?? null,
  };
}

async function toSummaries(
  db: TransactionClient,
  rows: UserSummaryRow[],
): Promise<AdminUserSummary[]> {
  const lastActivity = await lastActivityByUser(
    db,
    rows.map((row) => row.id),
  );

  return rows.map((row) => toSummary(row, lastActivity.get(row.id) ?? null));
}

async function withLastActivity(
  db: TransactionClient,
  row: UserSummaryRow,
): Promise<AdminUserSummary> {
  const [summary] = await toSummaries(db, [row]);

  return summary!;
}

/**
 * Regra central da Fase 3.3: admin so gerencia contas `user`; contas `admin`/`super_user`
 * so sao alteradas por `super_user`. Vale para status e papel.
 */
export function canManage(actorRole: Role, targetRole: Role): boolean {
  return actorRole === 'super_user' || (hasRole(actorRole, 'admin') && targetRole === 'user');
}

export async function getUsers(query: ListUsersQuery): Promise<Page<AdminUserSummary>> {
  const { items, total } = await listUsers({
    search: query.q,
    status: query.status,
    roles: query.role ? [query.role] : undefined,
    page: query.page,
    limit: query.limit,
  });

  return { items: await toSummaries(prisma, items), total, page: query.page, limit: query.limit };
}

export async function getAdmins(query: ListAdminsQuery): Promise<Page<AdminUserSummary>> {
  const { items, total } = await listUsers({
    search: query.q,
    status: query.status,
    roles: query.role ? [query.role] : ADMIN_ROLES,
    page: query.page,
    limit: query.limit,
  });

  return { items: await toSummaries(prisma, items), total, page: query.page, limit: query.limit };
}

export async function getUserDetail(id: string): Promise<AdminUserDetail> {
  const [user, stats] = await Promise.all([findUserDetail(id), userStats(id)]);

  if (!user) {
    throw AppError.notFound('Usuario nao encontrado');
  }

  return {
    ...toSummary(user, stats.lastActivityAt),
    updatedAt: user.updatedAt.toISOString(),
    authMethods: { password: user.passwordHash !== null, oauthProvider: user.oauthProvider },
    profile: {
      timezone: user.profile?.timezone ?? 'America/Sao_Paulo',
      weightKg: user.profile?.weightKg ?? null,
      heightCm: user.profile?.heightCm ?? null,
      onboardingCompletedAt: user.profile?.onboardingCompletedAt?.toISOString() ?? null,
    },
    stats: { ...stats, lastActivityAt: stats.lastActivityAt?.toISOString() ?? null },
  };
}

async function currentSummary(tx: TransactionClient, id: string): Promise<AdminUserSummary> {
  const row = await findUserSummary(tx, id);

  if (!row) {
    throw AppError.notFound('Usuario nao encontrado');
  }

  return withLastActivity(tx, row);
}

/**
 * Banir/desativar tambem incrementa `tokenVersion`: o access token ja cai no proximo request
 * (`authenticate` confere o status), e assim os refresh tokens emitidos antes nao voltam a
 * valer se a conta for reativada depois.
 */
export function changeUserStatus(
  actor: AdminActor,
  id: string,
  input: { status: UserStatus; reason?: string | undefined },
): Promise<AdminUserSummary> {
  return runAudited(actor.id, async (tx, log) => {
    const target = await lockUser(tx, id);

    if (!target) {
      throw AppError.notFound('Usuario nao encontrado');
    }

    if (target.id === actor.id) {
      throw AppError.forbidden('Nao e permitido alterar o status da propria conta');
    }

    if (!canManage(actor.role, target.role)) {
      throw AppError.forbidden('Somente super_user altera contas de admin ou super_user');
    }

    if (target.status === input.status) {
      return currentSummary(tx, id);
    }

    const updated = await updateUserAccess(tx, id, {
      status: input.status,
      revokeSessions: input.status !== 'active',
    });

    await log({
      action: 'user.status_changed',
      targetType: 'user',
      targetId: id,
      metadata: {
        from: target.status,
        to: input.status,
        targetRole: target.role,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });

    return withLastActivity(tx, updated);
  });
}

type RoleChangeScope =
  /** `PATCH /admin/users/:id/role`: so promove `user` -> `admin`. */
  | 'promote'
  /** `PATCH /admin/admins/:id/role`: alvo precisa ja ser admin/super_user. */
  | 'admins';

export function changeUserRole(
  actor: AdminActor,
  id: string,
  input: { role: Role; reason?: string | undefined },
  scope: RoleChangeScope,
): Promise<AdminUserSummary> {
  // As rotas ja exigem super_user; repetido aqui porque o service e a fronteira da regra.
  if (actor.role !== 'super_user') {
    return Promise.reject(AppError.forbidden("Requer papel 'super_user'"));
  }

  return runAudited(actor.id, async (tx, log) => {
    const target = await lockUser(tx, id);

    if (scope === 'admins' && (!target || !ADMIN_ROLES.includes(target.role))) {
      throw AppError.notFound('Administrador nao encontrado');
    }

    if (!target) {
      throw AppError.notFound('Usuario nao encontrado');
    }

    if (target.id === actor.id) {
      throw AppError.forbidden('Nao e permitido alterar o proprio papel');
    }

    if (scope === 'promote' && target.role === 'super_user') {
      throw AppError.conflict(
        'Usuario ja e super_user; para rebaixar use PATCH /admin/admins/:id/role',
      );
    }

    if (target.role === input.role) {
      return currentSummary(tx, id);
    }

    if (hasRole(input.role, 'admin') && target.status !== 'active') {
      throw AppError.conflict('Somente contas ativas podem receber papel administrativo');
    }

    const updated = await updateUserAccess(tx, id, { role: input.role });

    await log({
      action: 'user.role_changed',
      targetType: 'user',
      targetId: id,
      metadata: {
        from: target.role,
        to: input.role,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });

    return withLastActivity(tx, updated);
  });
}
