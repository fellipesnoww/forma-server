import { prisma } from '../../shared/db/client.js';
import type { Prisma } from '../../generated/prisma/client.js';

const sessionSummaryInclude = {
  sheet: { select: { name: true } },
  // So as contagens: o resumo (lista, calendario) mostra "7 exercicios · 26 series" sem
  // carregar as series de cada sessao
  exercises: { select: { _count: { select: { sets: true } } } },
} satisfies Prisma.WorkoutSessionInclude;

const sessionDetailInclude = {
  ...sessionSummaryInclude,
  exercises: {
    orderBy: { sortOrder: 'asc' },
    include: {
      exercise: true,
      customExercise: true,
      sets: { orderBy: { setNumber: 'asc' } },
    },
  },
} satisfies Prisma.WorkoutSessionInclude;

export type SessionSummaryRow = Prisma.WorkoutSessionGetPayload<{
  include: typeof sessionSummaryInclude;
}>;
export type SessionDetailRow = Prisma.WorkoutSessionGetPayload<{
  include: typeof sessionDetailInclude;
}>;

export interface SessionSetInput {
  setNumber: number;
  reps: number;
  weightKg: number;
  completed: boolean;
}

export interface SessionExerciseInput {
  exerciseId?: string;
  customExerciseId?: string;
  sortOrder: number;
  sets: SessionSetInput[];
}

function exercisesCreateInput(
  exercises: SessionExerciseInput[],
): Prisma.SessionExerciseCreateWithoutSessionInput[] {
  return exercises.map((exercise) => ({
    exercise: exercise.exerciseId ? { connect: { id: exercise.exerciseId } } : undefined,
    customExercise: exercise.customExerciseId
      ? { connect: { id: exercise.customExerciseId } }
      : undefined,
    sortOrder: exercise.sortOrder,
    sets: { create: exercise.sets },
  }));
}

export function createSession(
  userId: string,
  data: {
    sheetId: string;
    performedAt?: Date;
    durationMinutes?: number;
    comment?: string;
    exercises: SessionExerciseInput[];
  },
): Promise<SessionDetailRow> {
  return prisma.workoutSession.create({
    data: {
      userId,
      sheetId: data.sheetId,
      performedAt: data.performedAt,
      durationMinutes: data.durationMinutes,
      comment: data.comment,
      exercises: { create: exercisesCreateInput(data.exercises) },
    },
    include: sessionDetailInclude,
  });
}

export function findSessionDetail(userId: string, id: string): Promise<SessionDetailRow | null> {
  return prisma.workoutSession.findFirst({
    where: { id, userId },
    include: sessionDetailInclude,
  });
}

/**
 * Atualiza campos escalares e, se `exercises` vier, substitui exercicios+series por completo
 * (mesma estrategia de `replaceSheet` na 1.4): sem diff granular, tudo numa transacao.
 */
export async function replaceSession(
  id: string,
  data: {
    performedAt?: Date;
    durationMinutes?: number | null;
    comment?: string | null;
    photoUrl?: null;
    exercises?: SessionExerciseInput[];
  },
): Promise<SessionDetailRow> {
  await prisma.$transaction(async (tx) => {
    if (data.exercises !== undefined) {
      await tx.sessionExercise.deleteMany({ where: { sessionId: id } });
    }

    await tx.workoutSession.update({
      where: { id },
      data: {
        performedAt: data.performedAt,
        durationMinutes: data.durationMinutes,
        comment: data.comment,
        photoUrl: data.photoUrl,
        ...(data.exercises !== undefined
          ? { exercises: { create: exercisesCreateInput(data.exercises) } }
          : {}),
      },
    });
  });

  return prisma.workoutSession.findUniqueOrThrow({ where: { id }, include: sessionDetailInclude });
}

/**
 * `completedAt: null` no where torna a escrita condicional: duas chamadas concorrentes nao
 * sobrescrevem o horario de finalizacao da primeira — base da idempotencia de `complete`.
 */
export async function markSessionCompleted(
  id: string,
  completedAt: Date,
  durationMinutes?: number,
): Promise<void> {
  await prisma.workoutSession.updateMany({
    where: { id, completedAt: null },
    data: { completedAt, ...(durationMinutes !== undefined ? { durationMinutes } : {}) },
  });
}

export async function updateSessionPhotoUrl(id: string, photoUrl: string): Promise<void> {
  await prisma.workoutSession.update({ where: { id }, data: { photoUrl } });
}

export interface SessionListFilter {
  from?: Date;
  to?: Date;
  sheetId?: string;
  page: number;
  limit: number;
}

function sessionWhere(userId: string, filter: SessionListFilter): Prisma.WorkoutSessionWhereInput {
  return {
    userId,
    ...(filter.sheetId ? { sheetId: filter.sheetId } : {}),
    performedAt: {
      ...(filter.from ? { gte: filter.from } : {}),
      ...(filter.to ? { lte: filter.to } : {}),
    },
  };
}

export async function listSessions(
  userId: string,
  filter: SessionListFilter,
): Promise<{ items: SessionSummaryRow[]; total: number }> {
  const where = sessionWhere(userId, filter);

  const [items, total] = await prisma.$transaction([
    prisma.workoutSession.findMany({
      where,
      include: sessionSummaryInclude,
      orderBy: { performedAt: 'desc' },
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
    prisma.workoutSession.count({ where }),
  ]);

  return { items, total };
}

/** Sessoes em `[start, end)`, sem paginacao — usado pelo detalhe do dia do calendario (2.2). */
export function listSessionsBetween(
  userId: string,
  start: Date,
  end: Date,
): Promise<SessionSummaryRow[]> {
  return prisma.workoutSession.findMany({
    where: { userId, performedAt: { gte: start, lt: end } },
    include: sessionSummaryInclude,
    orderBy: { performedAt: 'asc' },
  });
}
