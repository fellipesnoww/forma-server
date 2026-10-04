import { exerciseRefExists } from '../exercises/index.js';
import { activeSheetBelongsToUser } from '../workout-sheets/index.js';
import { AppError } from '../../shared/errors/index.js';
import { dbMediaStorage } from '../../shared/media/index.js';
import {
  createSession,
  findSessionDetail,
  listSessions,
  listSessionsBetween,
  markSessionCompleted,
  replaceSession,
  updateSessionPhotoUrl,
  type SessionDetailRow,
  type SessionExerciseInput,
  type SessionSummaryRow,
} from './workout-sessions.repository.js';
import type {
  CreateWorkoutSessionBody,
  ListWorkoutSessionsQuery,
  UpdateWorkoutSessionBody,
  UploadSessionPhotoBody,
} from './workout-sessions.schemas.js';

export interface SessionSetDto {
  id: string;
  setNumber: number;
  reps: number;
  weightKg: number;
  completed: boolean;
}

export interface SessionExerciseDto {
  id: string;
  exerciseId: string | null;
  customExerciseId: string | null;
  name: string;
  sortOrder: number;
  sets: SessionSetDto[];
}

export interface SessionSummaryDto {
  id: string;
  sheetId: string;
  sheetName: string;
  performedAt: string;
  completedAt: string | null;
  photoUrl: string | null;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionDetailDto extends SessionSummaryDto {
  exercises: SessionExerciseDto[];
}

function toSummaryDto(session: SessionSummaryRow): SessionSummaryDto {
  return {
    id: session.id,
    sheetId: session.sheetId,
    sheetName: session.sheet.name,
    performedAt: session.performedAt.toISOString(),
    completedAt: session.completedAt?.toISOString() ?? null,
    photoUrl: session.photoUrl,
    comment: session.comment,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

function toDetailDto(session: SessionDetailRow): SessionDetailDto {
  return {
    ...toSummaryDto(session),
    exercises: session.exercises.map((exercise) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      customExerciseId: exercise.customExerciseId,
      // Custom exercise removido (soft delete) depois do treino ainda resolve o nome: o
      // historico nao pode perder o que foi executado.
      name: exercise.exercise?.name ?? exercise.customExercise?.name ?? '',
      sortOrder: exercise.sortOrder,
      sets: exercise.sets.map((set) => ({
        id: set.id,
        setNumber: set.setNumber,
        reps: set.reps,
        weightKg: set.weightKg,
        completed: set.completed,
      })),
    })),
  };
}

/** Mesma regra da planilha (1.4): catalogo ativo ou custom do proprio usuario. */
async function validateExerciseReferences(
  userId: string,
  exercises: SessionExerciseInput[],
): Promise<void> {
  await Promise.all(
    exercises.map(async (ref) => {
      const exists = await exerciseRefExists(userId, ref);

      if (!exists) {
        throw AppError.badRequest(
          `Exercicio ${ref.exerciseId ?? ref.customExerciseId ?? ''} nao encontrado ou nao pertence ao usuario`,
        );
      }
    }),
  );
}

async function requireSessionDetail(userId: string, id: string): Promise<SessionDetailRow> {
  const session = await findSessionDetail(userId, id);

  if (!session) {
    throw AppError.notFound('Sessao nao encontrada');
  }

  return session;
}

export async function addSession(
  userId: string,
  input: CreateWorkoutSessionBody,
): Promise<SessionDetailDto> {
  if (!(await activeSheetBelongsToUser(userId, input.sheetId))) {
    throw AppError.badRequest('Planilha nao encontrada ou nao pertence ao usuario');
  }

  await validateExerciseReferences(userId, input.exercises);

  const session = await createSession(userId, {
    sheetId: input.sheetId,
    performedAt: input.performedAt ? new Date(input.performedAt) : undefined,
    comment: input.comment,
    exercises: input.exercises,
  });

  return toDetailDto(session);
}

export async function getSessionDetail(userId: string, id: string): Promise<SessionDetailDto> {
  return toDetailDto(await requireSessionDetail(userId, id));
}

export async function editSession(
  userId: string,
  id: string,
  input: UpdateWorkoutSessionBody,
): Promise<SessionDetailDto> {
  await requireSessionDetail(userId, id);

  if (input.exercises) {
    await validateExerciseReferences(userId, input.exercises);
  }

  const session = await replaceSession(id, {
    performedAt: input.performedAt ? new Date(input.performedAt) : undefined,
    comment: input.comment,
    photoUrl: input.photoUrl,
    exercises: input.exercises,
  });

  return toDetailDto(session);
}

/**
 * Idempotente: finalizar uma sessao ja finalizada devolve o mesmo estado (incluindo o
 * `completedAt` original) com 200, em vez de 409 — o client pode repetir a chamada apos
 * uma falha de rede sem tratar erro.
 */
export async function completeSession(userId: string, id: string): Promise<SessionDetailDto> {
  const session = await requireSessionDetail(userId, id);

  if (session.completedAt) {
    return toDetailDto(session);
  }

  await markSessionCompleted(id);

  return getSessionDetail(userId, id);
}

/**
 * Mesma decisao do avatar (1.2): reaproveita `dbMediaStorage` sem compressao/resize — ver
 * pendencias em `sdd/1.5-sessoes-treino.md`. A midia anterior nao e apagada.
 */
export async function uploadSessionPhoto(
  userId: string,
  id: string,
  input: UploadSessionPhotoBody,
): Promise<string> {
  await requireSessionDetail(userId, id);

  const stored = await dbMediaStorage.upload({
    data: input.data,
    declaredMimeType: input.mimeType,
    filename: input.filename,
    ownerId: userId,
  });

  await updateSessionPhotoUrl(id, stored.url);

  return stored.url;
}

export async function getSessions(
  userId: string,
  query: ListWorkoutSessionsQuery,
): Promise<{ items: SessionSummaryDto[]; total: number; page: number; limit: number }> {
  const { items, total } = await listSessions(userId, {
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    sheetId: query.sheetId,
    page: query.page,
    limit: query.limit,
  });

  return { items: items.map(toSummaryDto), total, page: query.page, limit: query.limit };
}

/** Usado por `features/calendar` (detalhe do dia): sessoes em `[start, end)`, mais antiga primeiro. */
export async function getSessionsBetween(
  userId: string,
  start: Date,
  end: Date,
): Promise<SessionSummaryDto[]> {
  return (await listSessionsBetween(userId, start, end)).map(toSummaryDto);
}
