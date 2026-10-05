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

export const lastSessionQuerySchema = z.object({
  excludeSessionId: z
    .uuid()
    .optional()
    .describe('Ignora esta sessao (ex.: a que esta em andamento no client)'),
});

export const lastSessionResponseSchema = z.object({
  exerciseId: z.uuid().nullable(),
  customExerciseId: z.uuid().nullable(),
  name: z.string(),
  lastSession: z
    .object({
      sessionId: z.uuid(),
      sheetId: z.uuid(),
      sheetName: z.string(),
      performedAt: z.iso.datetime(),
      completedAt: z.iso.datetime().nullable(),
      sets: z.array(
        z.object({
          setNumber: z.int(),
          reps: z.int(),
          weightKg: z.number(),
          completed: z.boolean(),
        }),
      ),
      suggestion: z
        .object({ weightKg: z.number(), reps: z.int() })
        .describe('Serie mais pesada da ultima sessao (desempate: mais reps)'),
    })
    .nullable()
    .describe('null quando o usuario nunca registrou series desse exercicio'),
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
export type LastSessionQuery = z.infer<typeof lastSessionQuerySchema>;
export type LastSessionResponse = z.infer<typeof lastSessionResponseSchema>;
export type ExerciseIdParams = z.infer<typeof exerciseIdParamsSchema>;
