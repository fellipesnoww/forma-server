import { Prisma } from '../../generated/prisma/client.js';

/**
 * Fragmento SQL `(lo, hi)`: instantes UTC do inicio de `from` e do inicio de `toExclusive`
 * (datas locais) no fuso `timezone`. Usado como CTE `bounds` pelas agregacoes por dia local
 * (calendario 2.2, progressao 2.4) para que o filtro em `performed_at` continue indexavel.
 */
export function localRangeBounds(from: string, toExclusive: string, timezone: string): Prisma.Sql {
  return Prisma.sql`
    SELECT (${from}::date::timestamp AT TIME ZONE ${timezone}) AS lo,
           (${toExclusive}::date::timestamp AT TIME ZONE ${timezone}) AS hi`;
}
