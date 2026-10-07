import { z } from 'zod';

import {
  activeStatusFilterSchema,
  mediaUploadSchema,
  paginated,
  paginationQuerySchema,
} from '../admin.schemas.js';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(SLUG_PATTERN, 'use letras minusculas, numeros e hifen (ex.: posterior-coxa)');

const exerciseNameSchema = z.string().trim().min(1).max(160);

export const listAdminExercisesQuerySchema = paginationQuerySchema.extend({
  q: z.string().min(1).optional().describe('Busca por nome (sem diferenciar maiusculas)'),
  muscleGroup: z.string().min(1).optional().describe('Slug do grupo muscular'),
  status: activeStatusFilterSchema,
});

export const createAdminExerciseBodySchema = z.object({
  name: exerciseNameSchema,
  muscleGroupSlug: z.string().min(1).optional(),
  isActive: z.boolean().default(true),
  media: mediaUploadSchema.optional(),
  femaleMedia: mediaUploadSchema.optional().describe('Variante da midia com executora feminina'),
});

export const updateAdminExerciseBodySchema = z
  .object({
    name: exerciseNameSchema.optional(),
    muscleGroupSlug: z.string().min(1).nullable().optional().describe('null remove o grupo'),
    media: mediaUploadSchema.optional().describe('Substitui a imagem/video do exercicio'),
    mediaUrl: z.null().optional().describe('Somente null (remove a midia)'),
    femaleMedia: mediaUploadSchema
      .optional()
      .describe('Substitui a variante feminina da imagem/video'),
    femaleMediaUrl: z.null().optional().describe('Somente null (remove a midia feminina)'),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Envie ao menos um campo',
  })
  .refine((data) => !(data.media && data.mediaUrl === null), {
    message: 'Envie media OU mediaUrl: null, nao ambos',
    path: ['mediaUrl'],
  })
  .refine((data) => !(data.femaleMedia && data.femaleMediaUrl === null), {
    message: 'Envie femaleMedia OU femaleMediaUrl: null, nao ambos',
    path: ['femaleMediaUrl'],
  });

export const updateExerciseStatusBodySchema = z.object({ isActive: z.boolean() });

const muscleGroupRefSchema = z.object({ id: z.uuid(), slug: z.string(), name: z.string() });

export const adminExerciseResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  muscleGroup: muscleGroupRefSchema.nullable(),
  isActive: z.boolean(),
  mediaUrl: z.string().nullable(),
  femaleMediaUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const adminExerciseListResponseSchema = paginated(adminExerciseResponseSchema);

export const createMuscleGroupBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: slugSchema.optional().describe('Default: derivado do nome (sem acento, kebab-case)'),
});

export const updateMuscleGroupBodySchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    slug: slugSchema
      .optional()
      .describe('Cuidado: clients filtram por slug (?muscleGroup=) e o enviam em muscleGroupSlug'),
  })
  .refine((data) => data.name !== undefined || data.slug !== undefined, {
    message: 'Envie ao menos um campo',
  });

export const muscleGroupResponseSchema = muscleGroupRefSchema.extend({
  exerciseCount: z.int().describe('Exercicios do catalogo (ativos e inativos) no grupo'),
});

export const muscleGroupListResponseSchema = z.object({
  items: z.array(muscleGroupResponseSchema),
});

export type ListAdminExercisesQuery = z.infer<typeof listAdminExercisesQuerySchema>;
export type CreateAdminExerciseBody = z.infer<typeof createAdminExerciseBodySchema>;
export type UpdateAdminExerciseBody = z.infer<typeof updateAdminExerciseBodySchema>;
export type AdminExerciseDto = z.infer<typeof adminExerciseResponseSchema>;
export type CreateMuscleGroupBody = z.infer<typeof createMuscleGroupBodySchema>;
export type UpdateMuscleGroupBody = z.infer<typeof updateMuscleGroupBodySchema>;
export type MuscleGroupDto = z.infer<typeof muscleGroupResponseSchema>;
