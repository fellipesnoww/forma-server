import { getActivitiesBetween } from '../activities/index.js';
import { getUserTimezone } from '../profile/index.js';
import { getSessionsBetween } from '../workout-sessions/index.js';
import { env } from '../../config/env.js';
import { addDays, monthRange } from '../../shared/time/index.js';
import { aggregateDays, localDayBounds, type CalendarDayRow } from './calendar.repository.js';
import type { MonthQuery } from './calendar.schemas.js';

interface DaySummary {
  workoutCount: number;
  activityCount: number;
  activityMinutes: number;
}

export interface CalendarDayDto {
  date: string;
  hasWorkout: boolean;
  hasActivity: boolean;
  photoUrls: string[];
  summary: DaySummary;
}

function toDayDto(row: CalendarDayRow): CalendarDayDto {
  return {
    date: row.date,
    hasWorkout: row.workoutCount > 0,
    hasActivity: row.activityCount > 0,
    photoUrls: row.photoUrls,
    summary: {
      workoutCount: row.workoutCount,
      activityCount: row.activityCount,
      activityMinutes: row.activityMinutes,
    },
  };
}

export async function getMonth(
  userId: string,
  query: MonthQuery,
): Promise<{
  year: number;
  month: number;
  timezone: string;
  photoLimit: number;
  days: CalendarDayDto[];
}> {
  const timezone = await getUserTimezone(userId);
  const { from, toExclusive } = monthRange(query.year, query.month);
  const photoLimit = env.CALENDAR_MAX_THUMBNAILS;
  const rows = await aggregateDays(userId, from, toExclusive, timezone, photoLimit);

  return { year: query.year, month: query.month, timezone, photoLimit, days: rows.map(toDayDto) };
}

export async function getDay(userId: string, date: string) {
  const timezone = await getUserTimezone(userId);
  const { start, end } = await localDayBounds(date, addDays(date, 1), timezone);
  const [workouts, activities] = await Promise.all([
    getSessionsBetween(userId, start, end),
    getActivitiesBetween(userId, start, end),
  ]);

  return {
    date,
    timezone,
    hasWorkout: workouts.length > 0,
    hasActivity: activities.length > 0,
    summary: {
      workoutCount: workouts.length,
      activityCount: activities.length,
      activityMinutes: activities.reduce((total, activity) => total + activity.durationMinutes, 0),
    },
    workouts,
    activities,
  };
}
