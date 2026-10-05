import { z } from 'zod';

export const RATING_PLATFORMS = ['mobile', 'web'] as const;

/** Texto vazio ou so espacos vira `null`: o client nao precisa decidir entre omitir e mandar ''. */
const observation = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => (value === '' ? null : value));

export const createRatingBodySchema = z.object({
  rank: z.int().min(1).max(5).describe('Nota de 1 a 5'),
  observation: observation.nullish().describe('Comentario livre, ate 2000 caracteres'),
  platform: z.enum(RATING_PLATFORMS),
  device: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe('Aparelho/navegador informado pelo client, ex.: "iPhone 15 · iOS 26.1"'),
});

export const ratingSchema = z.object({
  id: z.uuid(),
  rank: z.int(),
  observation: z.string().nullable(),
  platform: z.enum(RATING_PLATFORMS),
  device: z.string(),
  date: z.iso.datetime().describe('Momento da avaliacao (definido pelo servidor)'),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type CreateRatingBody = z.infer<typeof createRatingBodySchema>;
export type RatingDto = z.infer<typeof ratingSchema>;
