import { z } from 'zod';

import { performedAtSchema as sharedPerformedAtSchema } from '../../shared/validation/index.js';

const performedAtSchema = sharedPerformedAtSchema.describe(
  `Quando a atividade foi realizada. Default: agora. ${sharedPerformedAtSchema.description ?? ''}`,
);

/** 24h: uma atividade unica acima disso e quase certamente erro de digitacao. */
const MAX_DURATION_MINUTES = 24 * 60;

const durationMinutesSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_DURATION_MINUTES)
  .describe(`Duracao em minutos (1..${String(MAX_DURATION_MINUTES)})`);

export const createActivityTypeBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const createActivityBodySchema = z.object({
  activityTypeId: z.uuid().describe('Tipo padrao ou personalizado do proprio usuario'),
  performedAt: performedAtSchema.optional(),
  durationMinutes: durationMinutesSchema,
  comment: z.string().max(1000).optional(),
});

export const updateActivityBodySchema = z
  .object({
    activityTypeId: z.uuid().optional(),
    performedAt: performedAtSchema.optional(),
    durationMinutes: durationMinutesSchema.optional(),
    comment: z.string().max(1000).nullable().optional().describe('null remove o comentario'),
    photoUrl: z
      .null()
      .optional()
      .describe('Somente null (remove a foto). Para enviar foto use POST /activities/:id/photo'),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Envie ao menos um campo',
  });

export const uploadActivityPhotoBodySchema = z.object({
  data: z.string().min(1).describe('Conteudo do arquivo em base64, com ou sem prefixo data URL'),
  mimeType: z.string().min(1),
  filename: z.string().max(255).optional(),
});

export const listActivitiesQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const activityIdParamsSchema = z.object({ id: z.uuid() });

const activityTypeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  source: z.enum(['default', 'custom']),
});

export const activityTypeResponseSchema = activityTypeSchema;

export const activityTypeListResponseSchema = z.object({
  items: z.array(activityTypeSchema),
});

export const activityResponseSchema = z.object({
  id: z.uuid(),
  activityTypeId: z.uuid(),
  activityTypeName: z.string(),
  performedAt: z.iso.datetime(),
  durationMinutes: z.int(),
  comment: z.string().nullable(),
  photoUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const activityListResponseSchema = z.object({
  items: z.array(activityResponseSchema),
  total: z.int(),
  page: z.int(),
  limit: z.int(),
});

export const activityPhotoResponseSchema = z.object({
  photoUrl: z.string(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type CreateActivityTypeBody = z.infer<typeof createActivityTypeBodySchema>;
export type CreateActivityBody = z.infer<typeof createActivityBodySchema>;
export type UpdateActivityBody = z.infer<typeof updateActivityBodySchema>;
export type UploadActivityPhotoBody = z.infer<typeof uploadActivityPhotoBodySchema>;
export type ListActivitiesQuery = z.infer<typeof listActivitiesQuerySchema>;
