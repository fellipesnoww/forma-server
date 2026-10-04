import { z } from 'zod';

import { isValidLocalDate } from '../../shared/time/index.js';

/** Maior intervalo customizado aceito: evita agregacoes de decadas por engano. */
export const MAX_RANGE_DAYS = 366 * 3;

const localDateSchema = z
  .string()
  .refine(isValidLocalDate, { message: 'Use uma data valida no formato YYYY-MM-DD' });

/**
 * Periodo: `period` (30/60/90 dias terminando hoje no fuso do perfil) OU `from`+`to` (datas
 * locais inclusivas). Nada informado = 90 dias.
 */
const rangeQuerySchema = z.object({
  period: z
    .enum(['30', '60', '90'])
    .optional()
    .describe('Ultimos N dias incluindo hoje. Nao combina com from/to. Default: 90'),
  from: localDateSchema.optional().describe('Inicio inclusivo, YYYY-MM-DD (exige to)'),
  to: localDateSchema.optional().describe('Fim inclusivo, YYYY-MM-DD (exige from)'),
});

function validateRange(
  data: { period?: string; from?: string; to?: string },
  ctx: z.RefinementCtx,
): void {
  const hasCustom = data.from !== undefined || data.to !== undefined;

  if (hasCustom && data.period !== undefined) {
    ctx.addIssue({ code: 'custom', message: 'Use period OU from/to, nao ambos' });
  } else if (hasCustom && (data.from === undefined || data.to === undefined)) {
    ctx.addIssue({ code: 'custom', message: 'Intervalo customizado exige from e to' });
  } else if (data.from !== undefined && data.to !== undefined && data.from > data.to) {
    ctx.addIssue({ code: 'custom', message: 'from deve ser anterior ou igual a to' });
  }
}

export const loadQuerySchema = rangeQuerySchema
  .extend({
    exerciseId: z.uuid().optional().describe('Exercicio do catalogo'),
    customExerciseId: z.uuid().optional().describe('Exercicio personalizado do usuario'),
  })
  .superRefine((data, ctx) => {
    if ((data.exerciseId === undefined) === (data.customExerciseId === undefined)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Informe exatamente um de exerciseId ou customExerciseId',
      });
    }

    validateRange(data, ctx);
  });

export const MEASUREMENT_METRICS = ['weight', 'height', 'waist', 'chest'] as const;

export const measurementsQuerySchema = rangeQuerySchema
  .extend({
    metric: z.enum(MEASUREMENT_METRICS).describe('weight (kg), height/waist/chest (cm)'),
  })
  .superRefine(validateRange);

const rangeResponseFields = {
  timezone: z.string(),
  from: z.string().describe('YYYY-MM-DD inclusivo, no fuso do perfil'),
  to: z.string().describe('YYYY-MM-DD inclusivo, no fuso do perfil'),
};

export const loadResponseSchema = z.object({
  exerciseId: z.uuid().nullable(),
  customExerciseId: z.uuid().nullable(),
  ...rangeResponseFields,
  points: z
    .array(
      z.object({
        date: z.string().describe('Dia local com ao menos uma serie do exercicio'),
        maxWeightKg: z.number(),
        volumeKg: z.number().describe('sum(reps * weightKg)'),
        totalReps: z.int(),
        setCount: z.int(),
      }),
    )
    .describe('Um ponto por dia com treino do exercicio, em ordem cronologica'),
});

export const measurementsResponseSchema = z.object({
  metric: z.enum(MEASUREMENT_METRICS),
  unit: z.enum(['kg', 'cm']),
  ...rangeResponseFields,
  points: z
    .array(z.object({ measuredAt: z.iso.datetime(), value: z.number() }))
    .describe('Cada registro de POST /profile/measurements com a metrica, em ordem cronologica'),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type LoadQuery = z.infer<typeof loadQuerySchema>;
export type MeasurementsQuery = z.infer<typeof measurementsQuerySchema>;
export type MeasurementMetric = (typeof MEASUREMENT_METRICS)[number];
