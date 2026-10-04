import { getUserTimezone } from '../profile/index.js';
import { AppError } from '../../shared/errors/index.js';
import { addDays, daysBetween, todayIn } from '../../shared/time/index.js';
import {
  aggregateLoad,
  listMeasurementPoints,
  localRangeInstants,
  type LoadPointRow,
} from './progress.repository.js';
import {
  MAX_RANGE_DAYS,
  type LoadQuery,
  type MeasurementMetric,
  type MeasurementsQuery,
} from './progress.schemas.js';

const DEFAULT_PERIOD_DAYS = 90;

interface ResolvedRange {
  timezone: string;
  from: string;
  to: string;
  toExclusive: string;
}

/** `period` conta hoje: 30 dias = hoje e os 29 anteriores, no fuso do perfil. */
async function resolveRange(
  userId: string,
  query: { period?: string; from?: string; to?: string },
): Promise<ResolvedRange> {
  const timezone = await getUserTimezone(userId);

  if (query.from !== undefined && query.to !== undefined) {
    if (daysBetween(query.from, query.to) + 1 > MAX_RANGE_DAYS) {
      throw AppError.badRequest(`Intervalo maximo de ${String(MAX_RANGE_DAYS)} dias`);
    }

    return { timezone, from: query.from, to: query.to, toExclusive: addDays(query.to, 1) };
  }

  const days = query.period ? Number(query.period) : DEFAULT_PERIOD_DAYS;
  const today = todayIn(timezone);

  return { timezone, from: addDays(today, -(days - 1)), to: today, toExclusive: addDays(today, 1) };
}

export async function getLoadProgress(
  userId: string,
  query: LoadQuery,
): Promise<{
  exerciseId: string | null;
  customExerciseId: string | null;
  timezone: string;
  from: string;
  to: string;
  points: LoadPointRow[];
}> {
  const range = await resolveRange(userId, query);
  const points = await aggregateLoad(
    userId,
    { exerciseId: query.exerciseId, customExerciseId: query.customExerciseId },
    range,
  );

  return {
    exerciseId: query.exerciseId ?? null,
    customExerciseId: query.customExerciseId ?? null,
    timezone: range.timezone,
    from: range.from,
    to: range.to,
    points,
  };
}

export async function getMeasurementProgress(
  userId: string,
  query: MeasurementsQuery,
): Promise<{
  metric: MeasurementMetric;
  unit: 'kg' | 'cm';
  timezone: string;
  from: string;
  to: string;
  points: { measuredAt: string; value: number }[];
}> {
  const range = await resolveRange(userId, query);
  const { start, end } = await localRangeInstants(range.from, range.toExclusive, range.timezone);
  const points = await listMeasurementPoints(userId, query.metric, start, end);

  return {
    metric: query.metric,
    unit: query.metric === 'weight' ? 'kg' : 'cm',
    timezone: range.timezone,
    from: range.from,
    to: range.to,
    points: points.map((point) => ({
      measuredAt: point.measuredAt.toISOString(),
      value: point.value,
    })),
  };
}
