import { getUserTimezone } from '../profile/index.js';
import { addDays, monthRange, todayIn } from '../../shared/time/index.js';
import { activitiesByType, dailyWorkouts, plannedWeekdays } from './stats.repository.js';
import type { OverviewResponse } from './stats.schemas.js';

const WEEK_DAYS = 7;

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

/** Arredonda para centavos de kg: soma de floats nao deve vazar `8240.000000001` ao client. */
function roundKg(value: number): number {
  return Math.round(value * 100) / 100;
}

function percent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 100);
}

/**
 * Quantos dias de treino o mes tem segundo as planilhas ativas. Usa as planilhas de hoje para
 * o mes inteiro (nao ha historico de edicao de planilha), entao trocar de planilha no meio do
 * mes recalcula a meta do mes todo.
 */
function plannedInMonth(weekdays: number[], from: string, toExclusive: string): number {
  let planned = 0;

  for (let date = from; date < toExclusive; date = addDays(date, 1)) {
    const weekday = weekdayOf(date);

    planned += weekdays.filter((day) => day === weekday).length;
  }

  return planned;
}

export async function getOverview(userId: string): Promise<OverviewResponse> {
  const timezone = await getUserTimezone(userId);
  const today = todayIn(timezone);
  const weekFrom = addDays(today, -(WEEK_DAYS - 1));
  const previousFrom = addDays(weekFrom, -WEEK_DAYS);
  const tomorrow = addDays(today, 1);
  const [year, month] = today.split('-').map(Number) as [number, number];
  const monthBounds = monthRange(year, month);

  const [twoWeeks, monthDays, activityTypes, weekdays] = await Promise.all([
    dailyWorkouts(userId, { from: previousFrom, toExclusive: tomorrow, timezone }),
    dailyWorkouts(userId, { ...monthBounds, timezone }),
    activitiesByType(userId, { ...monthBounds, timezone }),
    plannedWeekdays(userId),
  ]);

  const byDate = new Map(twoWeeks.map((row) => [row.date, row]));
  const days = Array.from({ length: WEEK_DAYS }, (_, index) => {
    const date = addDays(weekFrom, index);
    const row = byDate.get(date);

    return {
      date,
      weekday: weekdayOf(date),
      volumeKg: roundKg(row?.volumeKg ?? 0),
      workoutCount: row?.workoutCount ?? 0,
    };
  });

  const volumeKg = roundKg(days.reduce((total, day) => total + day.volumeKg, 0));
  const previousVolumeKg = roundKg(
    twoWeeks.filter((row) => row.date < weekFrom).reduce((total, row) => total + row.volumeKg, 0),
  );
  const workoutCount = monthDays.reduce((total, row) => total + row.workoutCount, 0);
  const plannedWorkoutCount = plannedInMonth(weekdays, monthBounds.from, monthBounds.toExclusive);

  return {
    timezone,
    today,
    week: {
      from: weekFrom,
      to: today,
      volumeKg,
      previousVolumeKg,
      volumeChangePct:
        previousVolumeKg === 0
          ? null
          : Math.round(((volumeKg - previousVolumeKg) / previousVolumeKg) * 100),
      workoutCount: days.reduce((total, day) => total + day.workoutCount, 0),
      days,
    },
    month: {
      year,
      month,
      workoutCount,
      plannedWorkoutCount,
      planCompletionPct: percent(workoutCount, plannedWorkoutCount),
      activityCount: activityTypes.reduce((total, row) => total + row.count, 0),
      activityMinutes: activityTypes.reduce((total, row) => total + row.minutes, 0),
      activityTypes,
    },
  };
}
