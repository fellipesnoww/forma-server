import { prisma } from '../../../shared/db/client.js';
import type { Prisma } from '../../../generated/prisma/client.js';

const reportInclude = {
  user: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
  exercise: { select: { id: true, name: true, isActive: true } },
} as const;

export type AdminExerciseReportRow = Prisma.ExerciseReportGetPayload<{
  include: typeof reportInclude;
}>;

export interface ExerciseReportFilter {
  exerciseId?: string;
  userId?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

// `id` desempata reports gravados no mesmo milissegundo, mantendo a paginacao estavel
const newestFirst: Prisma.ExerciseReportOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

export async function listExerciseReports(
  filter: ExerciseReportFilter,
): Promise<{ items: AdminExerciseReportRow[]; total: number }> {
  const where: Prisma.ExerciseReportWhereInput = {
    ...(filter.exerciseId ? { exerciseId: filter.exerciseId } : {}),
    ...(filter.userId ? { userId: filter.userId } : {}),
    ...(filter.from || filter.to
      ? {
          createdAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lte: filter.to } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.exerciseReport.findMany({
      where,
      include: reportInclude,
      orderBy: newestFirst,
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
    prisma.exerciseReport.count({ where }),
  ]);

  return { items, total };
}
