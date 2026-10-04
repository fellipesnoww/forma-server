import { prisma } from '../../shared/db/client.js';
import type { ActivityType, Prisma } from '../../generated/prisma/client.js';

const activityInclude = {
  activityType: { select: { name: true } },
} satisfies Prisma.FreeActivityInclude;

export type ActivityRow = Prisma.FreeActivityGetPayload<{ include: typeof activityInclude }>;

/** Tipos visiveis ao usuario: padrao (`userId` null) + personalizados dele. */
function visibleTypesWhere(userId: string): Prisma.ActivityTypeWhereInput {
  return { OR: [{ userId: null }, { userId }] };
}

export function findVisibleActivityTypes(userId: string): Promise<ActivityType[]> {
  return prisma.activityType.findMany({
    where: visibleTypesWhere(userId),
    // Padrao primeiro (nulls first em user_id), depois alfabetico dentro de cada grupo
    orderBy: [{ userId: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
  });
}

export function findVisibleActivityTypeByName(
  userId: string,
  name: string,
): Promise<ActivityType | null> {
  return prisma.activityType.findFirst({
    where: { AND: [visibleTypesWhere(userId), { name: { equals: name, mode: 'insensitive' } }] },
  });
}

export async function activityTypeVisibleToUser(userId: string, id: string): Promise<boolean> {
  const type = await prisma.activityType.findFirst({
    where: { AND: [visibleTypesWhere(userId), { id }] },
    select: { id: true },
  });

  return type !== null;
}

export function createActivityType(userId: string, name: string): Promise<ActivityType> {
  return prisma.activityType.create({ data: { userId, name } });
}

export function createActivity(
  userId: string,
  data: {
    activityTypeId: string;
    performedAt?: Date;
    durationMinutes: number;
    comment?: string;
  },
): Promise<ActivityRow> {
  return prisma.freeActivity.create({
    data: { userId, ...data },
    include: activityInclude,
  });
}

export function findActivity(userId: string, id: string): Promise<ActivityRow | null> {
  return prisma.freeActivity.findFirst({ where: { id, userId }, include: activityInclude });
}

export function updateActivity(
  id: string,
  data: {
    activityTypeId?: string;
    performedAt?: Date;
    durationMinutes?: number;
    comment?: string | null;
    photoUrl?: string | null;
  },
): Promise<ActivityRow> {
  return prisma.freeActivity.update({ where: { id }, data, include: activityInclude });
}

export async function deleteActivity(id: string): Promise<void> {
  await prisma.freeActivity.delete({ where: { id } });
}

export interface ActivityListFilter {
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

export async function listActivities(
  userId: string,
  filter: ActivityListFilter,
): Promise<{ items: ActivityRow[]; total: number }> {
  const where: Prisma.FreeActivityWhereInput = {
    userId,
    performedAt: {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lte: filter.to } : {}),
    },
  };

  const [items, total] = await prisma.$transaction([
    prisma.freeActivity.findMany({
      where,
      include: activityInclude,
      orderBy: { performedAt: 'desc' },
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
    prisma.freeActivity.count({ where }),
  ]);

  return { items, total };
}

/** Atividades em `[start, end)`, sem paginacao — usado pelo detalhe do dia do calendario (2.2). */
export function listActivitiesBetween(
  userId: string,
  start: Date,
  end: Date,
): Promise<ActivityRow[]> {
  return prisma.freeActivity.findMany({
    where: { userId, performedAt: { gte: start, lt: end } },
    include: activityInclude,
    orderBy: { performedAt: 'asc' },
  });
}
