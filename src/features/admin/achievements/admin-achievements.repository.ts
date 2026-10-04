import { prisma, type TransactionClient } from '../../../shared/db/client.js';
import type { Prisma } from '../../../generated/prisma/client.js';

/**
 * `achievements`/`user_achievements` nascem na 3.5 sob o painel. A Fase 4.1 cria
 * `features/achievements/` (vitrine e motor) lendo as mesmas tabelas; o painel continua sendo
 * o unico lugar que cadastra conquistas.
 */

const withUnlockCount = { _count: { select: { unlocks: true } } } as const;

export type AchievementRow = Prisma.AchievementGetPayload<{ include: typeof withUnlockCount }>;

export interface AchievementData {
  name?: string;
  description?: string | null;
  iconUrl?: string | null;
  criteria?: Prisma.InputJsonValue;
  isActive?: boolean;
}

export async function listAchievements(filter: {
  search?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}): Promise<{ items: AchievementRow[]; total: number }> {
  const where: Prisma.AchievementWhereInput = {
    ...(filter.isActive === undefined ? {} : { isActive: filter.isActive }),
    ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.achievement.findMany({
      where,
      include: withUnlockCount,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
    prisma.achievement.count({ where }),
  ]);

  return { items, total };
}

export function findAchievement(db: TransactionClient, id: string): Promise<AchievementRow | null> {
  return db.achievement.findUnique({ where: { id }, include: withUnlockCount });
}

export function findAchievementNamed(
  db: TransactionClient,
  name: string,
  exceptId?: string,
): Promise<{ id: string } | null> {
  return db.achievement.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
}

export function createAchievement(
  db: TransactionClient,
  data: AchievementData & { name: string; criteria: Prisma.InputJsonValue },
): Promise<AchievementRow> {
  return db.achievement.create({ data, include: withUnlockCount });
}

export function updateAchievement(
  db: TransactionClient,
  id: string,
  data: AchievementData,
): Promise<AchievementRow> {
  return db.achievement.update({ where: { id }, data, include: withUnlockCount });
}

export async function deleteAchievement(db: TransactionClient, id: string): Promise<void> {
  await db.achievement.delete({ where: { id } });
}

/** Conquistas cujo criterio e concluir o desafio — bloqueiam a exclusao dele. */
export function countAchievementsForChallenge(
  db: TransactionClient,
  challengeId: string,
): Promise<number> {
  return db.achievement.count({
    where: {
      AND: [
        { criteria: { path: ['type'], equals: 'challenge_complete' } },
        { criteria: { path: ['challengeId'], equals: challengeId } },
      ],
    },
  });
}

export async function listUnlocks(
  achievementId: string,
  page: number,
  limit: number,
): Promise<{
  items: {
    unlockedAt: Date;
    user: { id: string; email: string; profile: { displayName: string | null } | null };
  }[];
  total: number;
}> {
  const where = { achievementId };

  const [items, total] = await prisma.$transaction([
    prisma.userAchievement.findMany({
      where,
      select: {
        unlockedAt: true,
        user: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
      },
      orderBy: [{ unlockedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.userAchievement.count({ where }),
  ]);

  return { items, total };
}
