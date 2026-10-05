import { prisma } from '../../../shared/db/client.js';
import type { RatingPlatform, Prisma } from '../../../generated/prisma/client.js';

const userInclude = {
  user: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
} as const;

export type AdminRatingRow = Prisma.RatingGetPayload<{ include: typeof userInclude }>;

export interface RatingFilter {
  platform?: RatingPlatform;
  rank?: number;
  userId?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

// `id` desempata avaliacoes gravadas no mesmo milissegundo, mantendo a paginacao estavel
const newestFirst: Prisma.RatingOrderByWithRelationInput[] = [{ date: 'desc' }, { id: 'desc' }];

export async function listRatings(
  filter: RatingFilter,
): Promise<{ items: AdminRatingRow[]; total: number; averageRank: number | null }> {
  const where: Prisma.RatingWhereInput = {
    ...(filter.platform ? { platform: filter.platform } : {}),
    ...(filter.rank ? { rank: filter.rank } : {}),
    ...(filter.userId ? { userId: filter.userId } : {}),
    ...(filter.from || filter.to
      ? {
          date: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lte: filter.to } : {}),
          },
        }
      : {}),
  };

  const [items, aggregate] = await prisma.$transaction([
    prisma.rating.findMany({
      where,
      include: userInclude,
      orderBy: newestFirst,
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
    prisma.rating.aggregate({ where, _count: true, _avg: { rank: true } }),
  ]);

  return { items, total: aggregate._count, averageRank: aggregate._avg.rank };
}
