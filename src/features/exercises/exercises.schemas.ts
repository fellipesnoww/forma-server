import { z } from 'zod';

export const listExercisesQuerySchema = z.object({
  muscleGroup: z.string().min(1).optional(),
  q: z.string().min(1).optional(),
});

export const createCustomExerciseBodySchema = z.object({
  name: z.string().min(1).max(160),
  muscleGroupSlug: z.string().min(1).optional(),
});

export const updateCustomExerciseBodySchema = z.object({
  name: z.string().min(1).max(160).optional(),
  muscleGroupSlug: z.string().min(1).optional(),
});

export const exerciseIdParamsSchema = z.object({
  id: z.uuid(),
});

const exerciseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  muscleGroup: z.string().nullable(),
  source: z.enum(['catalog', 'custom']),
  isActive: z.boolean(),
  mediaUrl: z.string().nullable(),
});

export const exerciseResponseSchema = exerciseSchema;

export const exerciseListResponseSchema = z.object({
  items: z.array(exerciseSchema),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ListExercisesQuery = z.infer<typeof listExercisesQuerySchema>;
export type CreateCustomExerciseBody = z.infer<typeof createCustomExerciseBodySchema>;
export type UpdateCustomExerciseBody = z.infer<typeof updateCustomExerciseBodySchema>;
export type ExerciseIdParams = z.infer<typeof exerciseIdParamsSchema>;
