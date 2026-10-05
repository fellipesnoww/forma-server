import { listRatings, type AdminRatingRow } from './admin-ratings.repository.js';
import type {
  AdminRatingDto,
  RatingListResponse,
  ListRatingsQuery,
} from './admin-ratings.schemas.js';

function toDto(row: AdminRatingRow): AdminRatingDto {
  return {
    id: row.id,
    user: {
      id: row.user.id,
      email: row.user.email,
      displayName: row.user.profile?.displayName ?? null,
    },
    rank: row.rank,
    observation: row.observation,
    platform: row.platform,
    device: row.device,
    date: row.date.toISOString(),
  };
}

export async function getRatings(query: ListRatingsQuery): Promise<RatingListResponse> {
  const { items, total, averageRank } = await listRatings({
    ...query,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  });

  return {
    items: items.map(toDto),
    total,
    page: query.page,
    limit: query.limit,
    averageRank: averageRank === null ? null : Math.round(averageRank * 100) / 100,
  };
}
