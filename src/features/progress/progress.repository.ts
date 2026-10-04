import { prisma } from '../../shared/db/client.js';
import { localRangeBounds } from '../../shared/db/local-range.js';
import { Prisma } from '../../generated/prisma/client.js';

export interface LoadPointRow {
  date: string;
  maxWeightKg: number;
  volumeKg: number;
  totalReps: number;
  setCount: number;
}

/**
 * Uma linha por dia local com series do exercicio. Conta todas as series registradas, nao so
 * as `completed` (ver sdd/2.4): o client nao e obrigado a marcar series, e ignora-las deixaria
 * o grafico vazio para quem nao marca.
 */
export function aggregateLoad(
  userId: string,
  ref: { exerciseId?: string; customExerciseId?: string },
  range: { from: string; toExclusive: string; timezone: string },
): Promise<LoadPointRow[]> {
  const exerciseFilter = ref.exerciseId
    ? Prisma.sql`e.exercise_id = ${ref.exerciseId}::uuid`
    : Prisma.sql`e.custom_exercise_id = ${ref.customExerciseId ?? null}::uuid`;

  return prisma.$queryRaw<LoadPointRow[]>`
    WITH bounds AS (${localRangeBounds(range.from, range.toExclusive, range.timezone)})
    SELECT
      to_char(s.performed_at AT TIME ZONE ${range.timezone}, 'YYYY-MM-DD') AS "date",
      max(st.weight_kg)::float8 AS "maxWeightKg",
      sum(st.reps * st.weight_kg)::float8 AS "volumeKg",
      sum(st.reps)::int AS "totalReps",
      count(*)::int AS "setCount"
    FROM workout_sessions s
    JOIN session_exercises e ON e.session_id = s.id
    JOIN session_sets st ON st.session_exercise_id = e.id
    CROSS JOIN bounds b
    WHERE s.user_id = ${userId}::uuid
      AND s.performed_at >= b.lo AND s.performed_at < b.hi
      AND ${exerciseFilter}
    GROUP BY 1
    ORDER BY 1`;
}

const METRIC_COLUMNS = {
  weight: 'weightKg',
  height: 'heightCm',
  waist: 'waistCm',
  chest: 'chestCm',
} as const;

export async function listMeasurementPoints(
  userId: string,
  metric: keyof typeof METRIC_COLUMNS,
  start: Date,
  end: Date,
): Promise<{ measuredAt: Date; value: number }[]> {
  const column = METRIC_COLUMNS[metric];
  const rows = await prisma.bodyMeasurement.findMany({
    where: { userId, createdAt: { gte: start, lt: end }, [column]: { not: null } },
    orderBy: { createdAt: 'asc' },
  });

  return rows.map((row) => ({ measuredAt: row.createdAt, value: row[column]! }));
}

/** Instantes UTC `[start, end)` do intervalo de datas locais. */
export async function localRangeInstants(
  from: string,
  toExclusive: string,
  timezone: string,
): Promise<{ start: Date; end: Date }> {
  const [row] = await prisma.$queryRaw<
    { lo: Date; hi: Date }[]
  >`${localRangeBounds(from, toExclusive, timezone)}`;

  return { start: row!.lo, end: row!.hi };
}
