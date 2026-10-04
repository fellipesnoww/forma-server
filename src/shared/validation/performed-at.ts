import { z } from 'zod';

import { env } from '../../config/env.js';

/** Tolerancia para relogio do client adiantado ao validar que `performedAt` nao esta no futuro. */
export const PERFORMED_AT_CLOCK_SKEW_MS = 5 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Limite retroativo (Fase 2.3) em relacao a `now`. Janela movel de N x 24h, nao "N dias de
 * calendario": independe do fuso do usuario e nao muda de resultado a meia-noite.
 */
export function isWithinRetroactiveLimit(
  performedAt: Date,
  maxDays: number | undefined,
  now: number = Date.now(),
): boolean {
  return maxDays === undefined || performedAt.getTime() >= now - maxDays * DAY_MS;
}

const retroactiveMessage =
  env.RETROACTIVE_MAX_DAYS === undefined
    ? 'Aceita valor passado (registro retroativo) sem limite.'
    : `Aceita valor passado ate ${String(env.RETROACTIVE_MAX_DAYS)} dias atras (RETROACTIVE_MAX_DAYS).`;

/**
 * `performedAt` de tudo que entra no historico/calendario (sessoes 1.5, atividades 2.1):
 * datetime ISO com offset, futuro rejeitado alem da tolerancia e passado limitado por
 * `RETROACTIVE_MAX_DAYS` quando definido. Fica em `shared/` para que a regra da 2.3 seja uma
 * so entre as features; a descricao entra no OpenAPI de todas as rotas que a usam.
 */
export const performedAtSchema = z.iso
  .datetime({ offset: true })
  .refine((value) => new Date(value).getTime() <= Date.now() + PERFORMED_AT_CLOCK_SKEW_MS, {
    message: 'performedAt nao pode estar no futuro',
  })
  .refine((value) => isWithinRetroactiveLimit(new Date(value), env.RETROACTIVE_MAX_DAYS), {
    message: `performedAt nao pode ser anterior a ${String(env.RETROACTIVE_MAX_DAYS)} dias atras`,
  })
  .describe(`ISO 8601 com offset. Futuro rejeitado (tolerancia de 5 min). ${retroactiveMessage}`);
