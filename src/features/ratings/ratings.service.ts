import type { Rating } from '../../generated/prisma/client.js';
import { insertRating } from './ratings.repository.js';
import type { CreateRatingBody, RatingDto } from './ratings.schemas.js';

function toDto(row: Rating): RatingDto {
  return {
    id: row.id,
    rank: row.rank,
    observation: row.observation,
    platform: row.platform,
    device: row.device,
    date: row.date.toISOString(),
  };
}

/** Sem limite por usuario: cada envio e uma avaliacao nova (o rate limit global segura abuso). */
export async function addRating(userId: string, body: CreateRatingBody): Promise<RatingDto> {
  const row = await insertRating({
    userId,
    rank: body.rank,
    observation: body.observation ?? null,
    platform: body.platform,
    device: body.device,
  });

  return toDto(row);
}
