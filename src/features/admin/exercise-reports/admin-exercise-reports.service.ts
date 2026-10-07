import {
  listExerciseReports,
  type AdminExerciseReportRow,
} from './admin-exercise-reports.repository.js';
import type {
  AdminExerciseReportDto,
  ExerciseReportListResponse,
  ListExerciseReportsQuery,
} from './admin-exercise-reports.schemas.js';

function toDto(row: AdminExerciseReportRow): AdminExerciseReportDto {
  return {
    id: row.id,
    exercise: { id: row.exercise.id, name: row.exercise.name, isActive: row.exercise.isActive },
    user: {
      id: row.user.id,
      email: row.user.email,
      displayName: row.user.profile?.displayName ?? null,
    },
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getExerciseReports(
  query: ListExerciseReportsQuery,
): Promise<ExerciseReportListResponse> {
  const { items, total } = await listExerciseReports({
    ...query,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  });

  return { items: items.map(toDto), total, page: query.page, limit: query.limit };
}
