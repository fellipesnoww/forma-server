import { z } from 'zod';

/** Tolerancia para relogio do client adiantado ao validar que `performedAt` nao esta no futuro. */
export const PERFORMED_AT_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * `performedAt` de tudo que entra no historico/calendario (sessoes 1.5, atividades 2.1):
 * datetime ISO com offset, passado permitido (registro retroativo), futuro rejeitado alem da
 * tolerancia. Fica em `shared/` para que a regra da 2.3 seja uma so entre as features.
 */
export const performedAtSchema = z.iso
  .datetime({ offset: true })
  .refine((value) => new Date(value).getTime() <= Date.now() + PERFORMED_AT_CLOCK_SKEW_MS, {
    message: 'performedAt nao pode estar no futuro',
  });
