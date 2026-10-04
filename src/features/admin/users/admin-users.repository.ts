import { prisma, type TransactionClient } from '../../../shared/db/client.js';
import type { Prisma, Role, UserStatus } from '../../../generated/prisma/client.js';

/**
 * Visao administrativa de contas. Le `users`/`user_profiles` e agrega contagens das tabelas
 * de treino/atividade direto daqui (mesmo precedente de `calendar`/`progress`, que agregam
 * tabelas de outras features): passar por N services publicos so para `count()` custaria
 * N idas ao banco a mais sem proteger nenhuma regra.
 */

const summarySelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  profile: { select: { displayName: true, avatarUrl: true } },
} as const;

export type UserSummaryRow = Prisma.UserGetPayload<{ select: typeof summarySelect }>;

const detailSelect = {
  ...summarySelect,
  updatedAt: true,
  passwordHash: true,
  oauthProvider: true,
  profile: {
    select: {
      displayName: true,
      avatarUrl: true,
      timezone: true,
      weightKg: true,
      heightCm: true,
      onboardingCompletedAt: true,
    },
  },
} as const;

export type UserDetailRow = Prisma.UserGetPayload<{ select: typeof detailSelect }>;

export interface UserListFilter {
  search?: string;
  status?: UserStatus;
  roles?: Role[];
  page: number;
  limit: number;
}

export async function listUsers(
  filter: UserListFilter,
): Promise<{ items: UserSummaryRow[]; total: number }> {
  const where: Prisma.UserWhereInput = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.roles ? { role: { in: filter.roles } } : {}),
    ...(filter.search
      ? {
          OR: [
            { email: { contains: filter.search, mode: 'insensitive' } },
            { profile: { displayName: { contains: filter.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: summarySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
    prisma.user.count({ where }),
  ]);

  return { items, total };
}

export function findUserSummary(db: TransactionClient, id: string): Promise<UserSummaryRow | null> {
  return db.user.findUnique({ where: { id }, select: summarySelect });
}

export function findUserDetail(id: string): Promise<UserDetailRow | null> {
  return prisma.user.findUnique({ where: { id }, select: detailSelect });
}

/**
 * Le a conta alvo dentro da transacao com `FOR UPDATE`: duas mudancas concorrentes de
 * papel/status no mesmo usuario serializam aqui, entao a regra "admin so altera user" e
 * avaliada sobre o papel vigente, nao sobre uma leitura que outra transacao ja invalidou.
 */
export async function lockUser(
  tx: TransactionClient,
  id: string,
): Promise<{ id: string; role: Role; status: UserStatus } | null> {
  const rows = await tx.$queryRaw<{ id: string; role: Role; status: UserStatus }[]>`
    SELECT id, role, status FROM users WHERE id = ${id}::uuid FOR UPDATE
  `;

  return rows[0] ?? null;
}

export async function updateUserAccess(
  tx: TransactionClient,
  id: string,
  data: { status?: UserStatus; role?: Role; revokeSessions?: boolean },
): Promise<UserSummaryRow> {
  return tx.user.update({
    where: { id },
    data: {
      ...(data.status ? { status: data.status } : {}),
      ...(data.role ? { role: data.role } : {}),
      // Mesmo mecanismo do logout: refresh tokens emitidos antes deixam de valer.
      ...(data.revokeSessions ? { tokenVersion: { increment: 1 } } : {}),
    },
    select: summarySelect,
  });
}

export interface UserStatsRow {
  workoutSheets: number;
  workoutSessions: number;
  completedWorkoutSessions: number;
  freeActivities: number;
  customExercises: number;
  achievementsUnlocked: number;
  challengesJoined: number;
  lastActivityAt: Date | null;
}

export async function userStats(userId: string): Promise<UserStatsRow> {
  const [
    workoutSheets,
    workoutSessions,
    completedWorkoutSessions,
    freeActivities,
    customExercises,
    achievementsUnlocked,
    challengesJoined,
    lastSession,
    lastActivity,
  ] = await prisma.$transaction([
    prisma.workoutSheet.count({ where: { userId, deletedAt: null } }),
    prisma.workoutSession.count({ where: { userId } }),
    prisma.workoutSession.count({ where: { userId, completedAt: { not: null } } }),
    prisma.freeActivity.count({ where: { userId } }),
    prisma.customExercise.count({ where: { userId, deletedAt: null } }),
    prisma.userAchievement.count({ where: { userId } }),
    prisma.userChallenge.count({ where: { userId } }),
    prisma.workoutSession.aggregate({ where: { userId }, _max: { performedAt: true } }),
    prisma.freeActivity.aggregate({ where: { userId }, _max: { performedAt: true } }),
  ]);

  const candidates = [lastSession._max.performedAt, lastActivity._max.performedAt].filter(
    (date): date is Date => date !== null,
  );

  return {
    workoutSheets,
    workoutSessions,
    completedWorkoutSessions,
    freeActivities,
    customExercises,
    achievementsUnlocked,
    challengesJoined,
    lastActivityAt: candidates.length
      ? new Date(Math.max(...candidates.map((date) => date.getTime())))
      : null,
  };
}
