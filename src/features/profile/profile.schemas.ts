import { z } from 'zod';

const positiveMeasurement = z.number().positive();

export const measurementFieldsSchema = z.object({
  weightKg: positiveMeasurement.optional(),
  heightCm: positiveMeasurement.optional(),
  waistCm: positiveMeasurement.optional(),
  chestCm: positiveMeasurement.optional(),
});

function requireAtLeastOneField(data: Record<string, unknown>, ctx: z.RefinementCtx): void {
  if (Object.values(data).every((value) => value === undefined)) {
    ctx.addIssue({ code: 'custom', message: 'Envie ao menos um campo' });
  }
}

export const updateProfileBodySchema = measurementFieldsSchema
  .extend({
    displayName: z.string().min(1).max(120).optional(),
  })
  .superRefine(requireAtLeastOneField);

export const createMeasurementBodySchema =
  measurementFieldsSchema.superRefine(requireAtLeastOneField);

export const listMeasurementsQuerySchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const uploadAvatarBodySchema = z.object({
  data: z.string().min(1).describe('Conteudo do arquivo em base64, com ou sem prefixo data URL'),
  mimeType: z.string().min(1),
  filename: z.string().max(255).optional(),
});

const profileSchema = z.object({
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  weightKg: z.number().nullable(),
  heightCm: z.number().nullable(),
  waistCm: z.number().nullable(),
  chestCm: z.number().nullable(),
  onboardingCompletedAt: z.iso.datetime().nullable(),
});

export const profileResponseSchema = profileSchema;

const measurementSchema = z.object({
  id: z.uuid(),
  weightKg: z.number().nullable(),
  heightCm: z.number().nullable(),
  waistCm: z.number().nullable(),
  chestCm: z.number().nullable(),
  createdAt: z.iso.datetime(),
});

export const measurementResponseSchema = measurementSchema;

export const measurementListResponseSchema = z.object({
  items: z.array(measurementSchema),
  total: z.int(),
  page: z.int(),
  limit: z.int(),
});

export const avatarResponseSchema = z.object({
  avatarUrl: z.string(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;
export type CreateMeasurementBody = z.infer<typeof createMeasurementBodySchema>;
export type ListMeasurementsQuery = z.infer<typeof listMeasurementsQuerySchema>;
export type UploadAvatarBody = z.infer<typeof uploadAvatarBodySchema>;
