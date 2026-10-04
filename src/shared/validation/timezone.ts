import { z } from 'zod';

/** Fuso padrao do produto (pt-BR). Mesmo default da coluna `user_profiles.timezone`. */
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/**
 * Nome IANA aceito pelo runtime (`Intl`). O Postgres usa a mesma base IANA no `AT TIME ZONE`,
 * entao o que passa aqui tambem e entendido pelas agregacoes do calendario/progressao.
 */
export function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0);

    return true;
  } catch {
    return false;
  }
}

export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimezone, { message: 'Fuso horario IANA invalido (ex.: America/Sao_Paulo)' })
  .describe('Fuso IANA, ex.: America/Sao_Paulo');
