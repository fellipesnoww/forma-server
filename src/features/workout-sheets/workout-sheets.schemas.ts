import { z } from 'zod';

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

const sheetExerciseInputSchema = z
  .object({
    exerciseId: z.uuid().optional(),
    customExerciseId: z.uuid().optional(),
    sortOrder: z.number().int().min(0),
    targetSets: z.number().int().positive().optional(),
    targetReps: z.number().int().positive().optional(),
  })
  .superRefine(requireExactlyOneExerciseRef);

const sheetDayInputSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  order: z.number().int().min(0),
  exercises: z.array(sheetExerciseInputSchema).min(1),
});

function requireUniqueWeekdays(data: { days: { weekday: number }[] }, ctx: z.RefinementCtx): void {
  const weekdays = data.days.map((day) => day.weekday);

  if (new Set(weekdays).size !== weekdays.length) {
    ctx.addIssue({
      code: 'custom',
      message: 'weekday deve ser unico por planilha',
      path: ['days'],
    });
  }
}

export const createWorkoutSheetBodySchema = z
  .object({
    name: z.string().min(1).max(120),
    days: z.array(sheetDayInputSchema).min(1),
  })
  .superRefine(requireUniqueWeekdays);

export const updateWorkoutSheetBodySchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    days: z.array(sheetDayInputSchema).min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.days) {
      requireUniqueWeekdays({ days: data.days }, ctx);
    }
  })
  .refine((data) => data.name !== undefined || data.days !== undefined, {
    message: 'Envie ao menos um campo',
  });

export const reorderExercisesBodySchema = z.object({
  dayId: z.uuid(),
  exercises: z.array(z.object({ id: z.uuid(), sortOrder: z.number().int().min(0) })).min(1),
});

export const sheetIdParamsSchema = z.object({ id: z.uuid() });

const sheetExerciseSchema = z.object({
  id: z.uuid(),
  exerciseId: z.uuid().nullable(),
  customExerciseId: z.uuid().nullable(),
  name: z.string(),
  sortOrder: z.int(),
  targetSets: z.int().nullable(),
  targetReps: z.int().nullable(),
});

const sheetDaySchema = z.object({
  id: z.uuid(),
  weekday: z.int(),
  order: z.int(),
  exercises: z.array(sheetExerciseSchema),
});

export const sheetDetailResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  days: z.array(sheetDaySchema),
});

export const sheetSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const sheetListResponseSchema = z.object({
  items: z.array(sheetSummarySchema),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type CreateWorkoutSheetBody = z.infer<typeof createWorkoutSheetBodySchema>;
export type UpdateWorkoutSheetBody = z.infer<typeof updateWorkoutSheetBodySchema>;
export type ReorderExercisesBody = z.infer<typeof reorderExercisesBodySchema>;
export type SheetIdParams = z.infer<typeof sheetIdParamsSchema>;
