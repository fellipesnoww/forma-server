import { prisma } from '../../shared/db/client.js';
import type { Rating, RatingPlatform } from '../../generated/prisma/client.js';

export interface RatingInsert {
  userId: string;
  rank: number;
  observation: string | null;
  platform: RatingPlatform;
  device: string;
}

export function insertRating(data: RatingInsert): Promise<Rating> {
  return prisma.rating.create({ data });
}
