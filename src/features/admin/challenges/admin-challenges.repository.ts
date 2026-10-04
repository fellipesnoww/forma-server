import { prisma, type TransactionClient } from '../../../shared/db/client.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { ChallengePeriod } from './admin-challenges.schemas.js';

/** Ver nota de posse em `admin-achievements.repository.ts` — mesma situacao (Fase 4.2). */

const withParticipantCount = { _count: { select: { participants: true } } } as const;

export type ChallengeRow = Prisma.ChallengeGetPayload<{ include: typeof withParticipantCount }>;

export interface ChallengeData {
  name?: string;
  description?: string | null;
  goal?: Prisma.InputJsonValue;
  reward?: string | null;
  startsAt?: Date;
  endsAt?: Date;
  isActive?: boolean;
}

function periodWhere(period: ChallengePeriod, now: Date): Prisma.ChallengeWhereInput {
  switch (period) {
    case 'upcoming':
      return { startsAt: { gt: now } };
    case 'ongoing':
      return { startsAt: { lte: now }, endsAt: { gt: now } };
    default:
      return { endsAt: { lte: now } };
  }
}

export async function listChallenges(filter: {
  search?: string;
  isActive?: boolean;
  period?: ChallengePeriod;
  now: Date;
  page: number;
  limit: number;
}): Promise<{ items: ChallengeRow[]; total: number }> {
  const where: Prisma.ChallengeWhereInput = {
    ...(filter.isActive === undefined ? {} : { isActive: filter.isActive }),
    ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
    ...(filter.period ? periodWhere(filter.period, filter.now) : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.challenge.findMany({
      where,
      include: withParticipantCount,
      orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
    prisma.challenge.count({ where }),
  ]);

  return { items, total };
}

export function findChallenge(db: TransactionClient, id: string): Promise<ChallengeRow | null> {
  return db.challenge.findUnique({ where: { id }, include: withParticipantCount });
}

export function createChallenge(
  db: TransactionClient,
  data: ChallengeData & { name: string; goal: Prisma.InputJsonValue; startsAt: Date; endsAt: Date },
): Promise<ChallengeRow> {
  return db.challenge.create({ data, include: withParticipantCount });
}

export function updateChallenge(
  db: TransactionClient,
  id: string,
  data: ChallengeData,
): Promise<ChallengeRow> {
  return db.challenge.update({ where: { id }, data, include: withParticipantCount });
}

export async function deleteChallenge(db: TransactionClient, id: string): Promise<void> {
  await db.challenge.delete({ where: { id } });
}
