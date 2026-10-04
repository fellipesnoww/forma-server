import { prisma } from '../../shared/db/client.js';
import type { Prisma } from '../../generated/prisma/client.js';

export type ProfileRow = Prisma.UserProfileGetPayload<Record<string, never>>;
export type MeasurementRow = Prisma.BodyMeasurementGetPayload<Record<string, never>>;

export interface MeasurementFields {
  weightKg?: number;
  heightCm?: number;
  waistCm?: number;
  chestCm?: number;
}

export function findProfileByUserId(userId: string): Promise<ProfileRow | null> {
  return prisma.userProfile.findUnique({ where: { userId } });
}

export function updateProfile(
  userId: string,
  data: MeasurementFields & { displayName?: string; timezone?: string },
): Promise<ProfileRow> {
  return prisma.userProfile.update({ where: { userId }, data });
}

export function updateAvatarUrl(userId: string, avatarUrl: string): Promise<ProfileRow> {
  return prisma.userProfile.update({ where: { userId }, data: { avatarUrl } });
}

/**
 * Cria o registro de historico e sincroniza os campos atuais em `user_profiles` numa
 * unica transacao: as duas escritas precisam ser atomicas, senao um erro no meio deixa
 * o historico e o snapshot atual divergentes.
 */
export async function createMeasurement(
  userId: string,
  data: MeasurementFields,
): Promise<MeasurementRow> {
  const [measurement] = await prisma.$transaction([
    prisma.bodyMeasurement.create({ data: { userId, ...data } }),
    prisma.userProfile.update({ where: { userId }, data }),
  ]);

  return measurement;
}

export interface MeasurementListFilter {
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

function measurementWhere(
  userId: string,
  filter: MeasurementListFilter,
): Prisma.BodyMeasurementWhereInput {
  return {
    userId,
    createdAt: {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lte: filter.to } : {}),
    },
  };
}

export async function listMeasurements(
  userId: string,
  filter: MeasurementListFilter,
): Promise<{ items: MeasurementRow[]; total: number }> {
  const where = measurementWhere(userId, filter);

  const [items, total] = await prisma.$transaction([
    prisma.bodyMeasurement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
    prisma.bodyMeasurement.count({ where }),
  ]);

  return { items, total };
}
