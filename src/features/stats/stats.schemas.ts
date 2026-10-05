import { z } from 'zod';

const localDate = z.string().describe('YYYY-MM-DD no fuso do perfil');

export const overviewResponseSchema = z.object({
  timezone: z.string(),
  today: localDate,
  week: z
    .object({
      from: localDate,
      to: localDate,
      volumeKg: z.number().describe('sum(reps * weightKg) das sessoes dos ultimos 7 dias'),
      previousVolumeKg: z.number().describe('Mesmo calculo nos 7 dias anteriores'),
      volumeChangePct: z
        .int()
        .nullable()
        .describe('Variacao % contra os 7 dias anteriores; null quando o periodo anterior e 0'),
      workoutCount: z.int(),
      days: z
        .array(
          z.object({
            date: localDate,
            weekday: z.int().describe('0 = domingo .. 6 = sabado'),
            volumeKg: z.number(),
            workoutCount: z.int(),
          }),
        )
        .describe('Sempre 7 itens, do mais antigo para hoje (dias sem treino com zero)'),
    })
    .describe('Ultimos 7 dias incluindo hoje'),
  month: z
    .object({
      year: z.int(),
      month: z.int(),
      workoutCount: z.int().describe('Sessoes no mes corrente, finalizadas ou nao'),
      plannedWorkoutCount: z
        .int()
        .describe('Dias de treino do mes inteiro segundo as planilhas ativas hoje'),
      planCompletionPct: z
        .int()
        .nullable()
        .describe('workoutCount / plannedWorkoutCount em %; null sem planilha com dias'),
      activityCount: z.int(),
      activityMinutes: z.int(),
      activityTypes: z
        .array(
          z.object({
            activityTypeId: z.uuid(),
            name: z.string(),
            count: z.int(),
            minutes: z.int(),
          }),
        )
        .describe('Mais frequente primeiro'),
    })
    .describe('Mes corrente no fuso do perfil'),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type OverviewResponse = z.infer<typeof overviewResponseSchema>;
