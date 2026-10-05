import { prisma } from '../../shared/db/client.js';
import type { Prisma } from '../../generated/prisma/client.js';

const sheetDetailInclude = {
  days: {
    orderBy: { order: 'asc' },
    include: {
      exercises: {
        orderBy: { sortOrder: 'asc' },
        include: { exercise: true, customExercise: true },
      },
    },
  },
} satisfies Prisma.WorkoutSheetInclude;

export type SheetDetailRow = Prisma.WorkoutSheetGetPayload<{ include: typeof sheetDetailInclude }>;
export type SheetSummaryRow = Prisma.WorkoutSheetGetPayload<Record<string, never>>;

export interface SheetExerciseInput {
  exerciseId?: string;
  customExerciseId?: string;
  sortOrder: number;
  targetSets?: number;
  targetReps?: number;
  defaultRestSeconds?: number;
}

export interface SheetDayInput {
  weekday: number;
  order: number;
  exercises: SheetExerciseInput[];
}

export function listSheets(userId: string): Promise<SheetSummaryRow[]> {
  return prisma.workoutSheet.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

export function findSheetDetail(userId: string, id: string): Promise<SheetDetailRow | null> {
  return prisma.workoutSheet.findFirst({
    where: { id, userId, deletedAt: null },
    include: sheetDetailInclude,
  });
}

/** Sem `deletedAt` no where: usado por reorder/patch apos ja confirmar posse via `findSheetDetail`. */
export function findSheetById(userId: string, id: string): Promise<SheetSummaryRow | null> {
  return prisma.workoutSheet.findFirst({ where: { id, userId, deletedAt: null } });
}

function daysCreateInput(days: SheetDayInput[]): Prisma.SheetDayCreateWithoutSheetInput[] {
  return days.map((day) => ({
    weekday: day.weekday,
    order: day.order,
    exercises: {
      create: day.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        customExerciseId: exercise.customExerciseId,
        sortOrder: exercise.sortOrder,
        targetSets: exercise.targetSets,
        targetReps: exercise.targetReps,
        defaultRestSeconds: exercise.defaultRestSeconds,
      })),
    },
  }));
}

export function createSheet(
  userId: string,
  data: { name: string; days: SheetDayInput[] },
): Promise<SheetDetailRow> {
  return prisma.workoutSheet.create({
    data: {
      userId,
      name: data.name,
      days: { create: daysCreateInput(data.days) },
    },
    include: sheetDetailInclude,
  });
}

/**
 * Substitui nome e/ou dias+exercicios por completo. Simples e correto: o roadmap nao pede
 * diff granular, e recriar dentro da mesma transacao evita reconciliar sortOrder/weekday
 * manualmente contra o estado anterior.
 */
export async function replaceSheet(
  id: string,
  data: { name?: string; days?: SheetDayInput[] },
): Promise<SheetDetailRow> {
  await prisma.$transaction(async (tx) => {
    if (data.name !== undefined) {
      await tx.workoutSheet.update({ where: { id }, data: { name: data.name } });
    }

    if (data.days !== undefined) {
      await tx.sheetDay.deleteMany({ where: { sheetId: id } });
      await tx.workoutSheet.update({
        where: { id },
        data: { days: { create: daysCreateInput(data.days) } },
      });
    }
  });

  const sheet = await prisma.workoutSheet.findUniqueOrThrow({
    where: { id },
    include: sheetDetailInclude,
  });

  return sheet;
}

export function softDeleteSheet(id: string): Promise<SheetSummaryRow> {
  return prisma.workoutSheet.update({ where: { id }, data: { deletedAt: new Date() } });
}

export function findDayWithSheet(
  dayId: string,
): Promise<{ id: string; sheetId: string; sheet: { userId: string } } | null> {
  return prisma.sheetDay.findUnique({
    where: { id: dayId },
    select: { id: true, sheetId: true, sheet: { select: { userId: true } } },
  });
}

export async function reorderSheetExercises(
  dayId: string,
  exercises: { id: string; sortOrder: number }[],
): Promise<void> {
  await prisma.$transaction(
    exercises.map((exercise) =>
      prisma.sheetExercise.update({
        where: { id: exercise.id, dayId },
        data: { sortOrder: exercise.sortOrder },
      }),
    ),
  );
}

export function countSheetExercisesInDay(dayId: string, ids: string[]): Promise<number> {
  return prisma.sheetExercise.count({ where: { dayId, id: { in: ids } } });
}
