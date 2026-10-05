import { prisma } from '../../shared/db/client.js';
import { localRangeBounds } from '../../shared/db/local-range.js';

/**
 * Agregacoes do dashboard. Mesmo precedente de `calendar`/`progress`: SQL direto sobre as
 * tabelas de sessoes/atividades/planilhas, agrupando por dia local no fuso do perfil.
 */

export interface DailyWorkoutRow {
  date: string;
  workoutCount: number;
  volumeKg: number;
}

/**
 * Por dia local com ao menos uma sessao: quantidade de sessoes e volume (`reps * weightKg`).
 * Todas as series contam, nao so as `completed` — mesma regra da progressao (2.4).
 */
export function dailyWorkouts(
  userId: string,
  range: { from: string; toExclusive: string; timezone: string },
): Promise<DailyWorkoutRow[]> {
  return prisma.$queryRaw<DailyWorkoutRow[]>`
    WITH bounds AS (${localRangeBounds(range.from, range.toExclusive, range.timezone)}),
    sessions AS (
      SELECT s.id, s.performed_at
      FROM workout_sessions s, bounds b
      WHERE s.user_id = ${userId}::uuid AND s.performed_at >= b.lo AND s.performed_at < b.hi
    )
    SELECT
      to_char(s.performed_at AT TIME ZONE ${range.timezone}, 'YYYY-MM-DD') AS "date",
      count(DISTINCT s.id)::int AS "workoutCount",
      coalesce(sum(st.reps * st.weight_kg), 0)::float8 AS "volumeKg"
    FROM sessions s
    LEFT JOIN session_exercises e ON e.session_id = s.id
    LEFT JOIN session_sets st ON st.session_exercise_id = e.id
    GROUP BY 1
    ORDER BY 1`;
}

export interface ActivityTypeTotalRow {
  activityTypeId: string;
  name: string;
  count: number;
  minutes: number;
}

/** Atividades livres no intervalo, agrupadas por tipo (mais frequente primeiro). */
export function activitiesByType(
  userId: string,
  range: { from: string; toExclusive: string; timezone: string },
): Promise<ActivityTypeTotalRow[]> {
  return prisma.$queryRaw<ActivityTypeTotalRow[]>`
    WITH bounds AS (${localRangeBounds(range.from, range.toExclusive, range.timezone)})
    SELECT
      t.id AS "activityTypeId",
      t.name AS "name",
      count(*)::int AS "count",
      sum(a.duration_minutes)::int AS "minutes"
    FROM free_activities a
    JOIN activity_types t ON t.id = a.activity_type_id
    CROSS JOIN bounds b
    WHERE a.user_id = ${userId}::uuid AND a.performed_at >= b.lo AND a.performed_at < b.hi
    GROUP BY t.id, t.name
    ORDER BY 3 DESC, 2 ASC`;
}

/** Um item por dia de treino das planilhas ativas (0 = domingo). Repete o weekday se duas planilhas usam o mesmo dia. */
export async function plannedWeekdays(userId: string): Promise<number[]> {
  const days = await prisma.sheetDay.findMany({
    where: { sheet: { userId, deletedAt: null } },
    select: { weekday: true },
  });

  return days.map((day) => day.weekday);
}
