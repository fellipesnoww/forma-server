import { z } from 'zod';

import { RATING_PLATFORMS } from '../../ratings/index.js';
import { paginated, paginationQuerySchema } from '../admin.schemas.js';

export const listRatingsQuerySchema = paginationQuerySchema.extend({
  platform: z.enum(RATING_PLATFORMS).optional(),
  rank: z.coerce.number().int().min(1).max(5).optional().describe('Nota exata'),
  userId: z.uuid().optional(),
  from: z.iso.datetime({ offset: true }).optional().describe('date >= from'),
  to: z.iso.datetime({ offset: true }).optional().describe('date <= to'),
});

const adminRatingSchema = z.object({
  id: z.uuid(),
  user: z.object({ id: z.uuid(), email: z.string(), displayName: z.string().nullable() }),
  rank: z.int(),
  observation: z.string().nullable(),
  platform: z.enum(RATING_PLATFORMS),
  device: z.string(),
  date: z.iso.datetime(),
});

export const ratingListResponseSchema = paginated(adminRatingSchema).extend({
  averageRank: z
    .number()
    .nullable()
    .describe('Media das notas do filtro inteiro (nao so da pagina), 2 casas; null sem linhas'),
});

export type ListRatingsQuery = z.infer<typeof listRatingsQuerySchema>;
export type AdminRatingDto = z.infer<typeof adminRatingSchema>;
export type RatingListResponse = z.infer<typeof ratingListResponseSchema>;
