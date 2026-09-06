import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number().describe('Tempo no ar em segundos'),
  timestamp: z.iso.datetime(),
});

export const dbHealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  db: z.object({
    status: z.enum(['up', 'down']),
    latencyMs: z
      .number()
      .nullable()
      .describe('Tempo do ping ao Postgres; null quando indisponivel'),
  }),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type DbHealthResponse = z.infer<typeof dbHealthResponseSchema>;
