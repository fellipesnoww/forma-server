import { z } from 'zod';

import { paginated, paginationQuerySchema } from '../admin.schemas.js';

export const listExerciseReportsQuerySchema = paginationQuerySchema.extend({
  exerciseId: z.uuid().optional(),
  userId: z.uuid().optional(),
  from: z.iso.datetime({ offset: true }).optional().describe('createdAt >= from'),
  to: z.iso.datetime({ offset: true }).optional().describe('createdAt <= to'),
});

const adminExerciseReportSchema = z.object({
  id: z.uuid(),
  exercise: z.object({ id: z.uuid(), name: z.string(), isActive: z.boolean() }),
  user: z.object({ id: z.uuid(), email: z.string(), displayName: z.string().nullable() }),
  text: z.string(),
  createdAt: z.iso.datetime(),
});

export const exerciseReportListResponseSchema = paginated(adminExerciseReportSchema);

export type ListExerciseReportsQuery = z.infer<typeof listExerciseReportsQuerySchema>;
export type AdminExerciseReportDto = z.infer<typeof adminExerciseReportSchema>;
export type ExerciseReportListResponse = z.infer<typeof exerciseReportListResponseSchema>;
