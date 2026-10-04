import { z } from 'zod';

import { activityResponseSchema } from '../activities/index.js';
import { sessionSummarySchema } from '../workout-sessions/index.js';
import { isValidLocalDate } from '../../shared/time/index.js';

export const monthQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const dateParamsSchema = z.object({
  date: z
    .string()
    .refine(isValidLocalDate, { message: 'Use uma data valida no formato YYYY-MM-DD' })
    .describe('Dia local no fuso do perfil, YYYY-MM-DD'),
});

const daySummarySchema = z.object({
  workoutCount: z.int(),
  activityCount: z.int(),
  activityMinutes: z.int().describe('Soma de durationMinutes das atividades do dia'),
});

const calendarDaySchema = z.object({
  date: z.string().describe('YYYY-MM-DD no fuso do perfil'),
  hasWorkout: z.boolean(),
  hasActivity: z.boolean(),
  photoUrls: z
    .array(z.string())
    .describe('Fotos de sessoes e atividades do dia, mais antiga primeiro, ate o limite'),
  summary: daySummarySchema,
});

export const calendarMonthResponseSchema = z.object({
  year: z.int(),
  month: z.int(),
  timezone: z.string(),
  photoLimit: z.int().describe('Maximo de photoUrls por dia (CALENDAR_MAX_THUMBNAILS)'),
  days: z.array(calendarDaySchema).describe('Somente dias com ao menos um registro, em ordem'),
});

export const calendarDayResponseSchema = z.object({
  date: z.string(),
  timezone: z.string(),
  hasWorkout: z.boolean(),
  hasActivity: z.boolean(),
  summary: daySummarySchema,
  workouts: z.array(sessionSummarySchema),
  activities: z.array(activityResponseSchema),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type MonthQuery = z.infer<typeof monthQuerySchema>;
