import { z } from 'zod';

import { performedAtSchema as sharedPerformedAtSchema } from '../../shared/validation/index.js';

const performedAtSchema = sharedPerformedAtSchema.describe(
  'Quando o treino foi realizado. Default: agora. Aceita valor passado (retroativo).',
);

const sessionSetInputSchema = z.object({
  setNumber: z.number().int().positive(),
  reps: z.number().int().min(0),
  weightKg: z.number().min(0).describe('0 = peso corporal'),
  completed: z.boolean().default(false),
});

function requireExactlyOneExerciseRef(
  data: { exerciseId?: string; customExerciseId?: string },
  ctx: z.RefinementCtx,
): void {
  const hasExercise = data.exerciseId !== undefined;
  const hasCustom = data.customExerciseId !== undefined;

  if (hasExercise === hasCustom) {
    ctx.addIssue({
      code: 'custom',
      message: 'Informe exatamente um de exerciseId ou customExerciseId',
    });
  }
}

function requireUniqueSetNumbers(
  data: { sets: { setNumber: number }[] },
  ctx: z.RefinementCtx,
): void {
  const numbers = data.sets.map((set) => set.setNumber);

  if (new Set(numbers).size !== numbers.length) {
    ctx.addIssue({
      code: 'custom',
      message: 'setNumber deve ser unico por exercicio',
      path: ['sets'],
    });
  }
}

const sessionExerciseInputSchema = z
  .object({
    exerciseId: z.uuid().optional(),
    customExerciseId: z.uuid().optional(),
    sortOrder: z.number().int().min(0),
    sets: z.array(sessionSetInputSchema).min(1),
  })
  .superRefine((data, ctx) => {
    requireExactlyOneExerciseRef(data, ctx);
    requireUniqueSetNumbers(data, ctx);
  });

export const createWorkoutSessionBodySchema = z.object({
  sheetId: z.uuid(),
  performedAt: performedAtSchema.optional(),
  comment: z.string().max(1000).optional(),
  exercises: z.array(sessionExerciseInputSchema).min(1),
});

export const updateWorkoutSessionBodySchema = z
  .object({
    performedAt: performedAtSchema.optional(),
    comment: z.string().max(1000).nullable().optional().describe('null remove o comentario'),
    photoUrl: z
      .null()
      .optional()
      .describe(
        'Somente null (remove a foto). Para enviar foto use POST /workout-sessions/:id/photo',
      ),
    exercises: z
      .array(sessionExerciseInputSchema)
      .min(1)
      .optional()
      .describe('Substitui todos os exercicios e series da sessao'),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Envie ao menos um campo',
  });

export const uploadSessionPhotoBodySchema = z.object({
  data: z.string().min(1).describe('Conteudo do arquivo em base64, com ou sem prefixo data URL'),
  mimeType: z.string().min(1),
  filename: z.string().max(255).optional(),
});

export const listWorkoutSessionsQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  sheetId: z.uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const sessionIdParamsSchema = z.object({ id: z.uuid() });

const sessionSetSchema = z.object({
  id: z.uuid(),
  setNumber: z.int(),
  reps: z.int(),
  weightKg: z.number(),
  completed: z.boolean(),
});

const sessionExerciseSchema = z.object({
  id: z.uuid(),
  exerciseId: z.uuid().nullable(),
  customExerciseId: z.uuid().nullable(),
  name: z.string(),
  sortOrder: z.int(),
  sets: z.array(sessionSetSchema),
});

export const sessionSummarySchema = z.object({
  id: z.uuid(),
  sheetId: z.uuid(),
  sheetName: z.string(),
  performedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  photoUrl: z.string().nullable(),
  comment: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const sessionDetailResponseSchema = sessionSummarySchema.extend({
  exercises: z.array(sessionExerciseSchema),
});

export const sessionListResponseSchema = z.object({
  items: z.array(sessionSummarySchema),
  total: z.int(),
  page: z.int(),
  limit: z.int(),
});

export const sessionPhotoResponseSchema = z.object({
  photoUrl: z.string(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type CreateWorkoutSessionBody = z.infer<typeof createWorkoutSessionBodySchema>;
export type UpdateWorkoutSessionBody = z.infer<typeof updateWorkoutSessionBodySchema>;
export type UploadSessionPhotoBody = z.infer<typeof uploadSessionPhotoBodySchema>;
export type ListWorkoutSessionsQuery = z.infer<typeof listWorkoutSessionsQuerySchema>;
