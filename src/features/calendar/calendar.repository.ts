import { prisma } from '../../shared/db/client.js';
import { localRangeBounds } from '../../shared/db/local-range.js';

export interface CalendarDayRow {
  date: string;
  workoutCount: number;
  activityCount: number;
  activityMinutes: number;
  photoUrls: string[];
}

/**
 * Agrega sessoes + atividades por dia local entre `from` e `toExclusive`. O filtro usa os
 * instantes UTC dos limites (CTE `bounds`), entao os indices `(user_id, performed_at)` das
 * duas tabelas continuam valendo; so o agrupamento converte para o fuso.
 */
export function aggregateDays(
  userId: string,
  from: string,
  toExclusive: string,
  timezone: string,
  photoLimit: number,
): Promise<CalendarDayRow[]> {
  return prisma.$queryRaw<CalendarDayRow[]>`
    WITH bounds AS (${localRangeBounds(from, toExclusive, timezone)}),
    entries AS (
      SELECT true AS is_workout, s.performed_at, s.photo_url, 0 AS minutes
      FROM workout_sessions s, bounds b
      WHERE s.user_id = ${userId}::uuid AND s.performed_at >= b.lo AND s.performed_at < b.hi
      UNION ALL
      SELECT false, a.performed_at, a.photo_url, a.duration_minutes
      FROM free_activities a, bounds b
      WHERE a.user_id = ${userId}::uuid AND a.performed_at >= b.lo AND a.performed_at < b.hi
    )
    SELECT
      to_char(performed_at AT TIME ZONE ${timezone}, 'YYYY-MM-DD') AS "date",
      (count(*) FILTER (WHERE is_workout))::int AS "workoutCount",
      (count(*) FILTER (WHERE NOT is_workout))::int AS "activityCount",
      coalesce(sum(minutes), 0)::int AS "activityMinutes",
      coalesce(
        (array_agg(photo_url ORDER BY performed_at) FILTER (WHERE photo_url IS NOT NULL))[1:${photoLimit}::int],
        '{}'
      ) AS "photoUrls"
    FROM entries
    GROUP BY 1
    ORDER BY 1`;
}

/** Instantes UTC `[start, end)` do dia local `date` no fuso `timezone`. */
export async function localDayBounds(
  date: string,
  nextDate: string,
  timezone: string,
): Promise<{ start: Date; end: Date }> {
  const [row] = await prisma.$queryRaw<
    { lo: Date; hi: Date }[]
  >`${localRangeBounds(date, nextDate, timezone)}`;

  return { start: row!.lo, end: row!.hi };
}
