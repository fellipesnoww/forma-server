import { prisma } from '../../shared/db/client.js';
import type { ExerciseReport, Prisma } from '../../generated/prisma/client.js';

export type CatalogExerciseRow = Prisma.ExerciseGetPayload<{ include: { muscleGroup: true } }>;
export type CustomExerciseRow = Prisma.CustomExerciseGetPayload<{
  include: { muscleGroup: true };
}>;

export interface ExerciseListFilter {
  muscleGroupSlug?: string;
  search?: string;
}

export function findCatalogExercises(filter: ExerciseListFilter): Promise<CatalogExerciseRow[]> {
  return prisma.exercise.findMany({
    where: {
      isActive: true,
      ...(filter.muscleGroupSlug ? { muscleGroup: { slug: filter.muscleGroupSlug } } : {}),
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
    },
    include: { muscleGroup: true },
    orderBy: { name: 'asc' },
  });
}

export function findCustomExercises(
  userId: string,
  filter: ExerciseListFilter,
): Promise<CustomExerciseRow[]> {
  return prisma.customExercise.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(filter.muscleGroupSlug ? { muscleGroup: { slug: filter.muscleGroupSlug } } : {}),
      ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
    },
    include: { muscleGroup: true },
    orderBy: { name: 'asc' },
  });
}

export function findMuscleGroupBySlug(slug: string): Promise<{ id: string } | null> {
  return prisma.muscleGroup.findUnique({ where: { slug }, select: { id: true } });
}

export function findCustomExerciseById(id: string): Promise<CustomExerciseRow | null> {
  return prisma.customExercise.findUnique({ where: { id }, include: { muscleGroup: true } });
}

export function createCustomExercise(
  userId: string,
  data: { name: string; muscleGroupId?: string },
): Promise<CustomExerciseRow> {
  return prisma.customExercise.create({
    data: { userId, name: data.name, muscleGroupId: data.muscleGroupId },
    include: { muscleGroup: true },
  });
}

export function updateCustomExercise(
  id: string,
  data: { name?: string; muscleGroupId?: string | null },
): Promise<CustomExerciseRow> {
  return prisma.customExercise.update({
    where: { id },
    data,
    include: { muscleGroup: true },
  });
}

export function softDeleteCustomExercise(id: string): Promise<CustomExerciseRow> {
  return prisma.customExercise.update({
    where: { id },
    data: { deletedAt: new Date() },
    include: { muscleGroup: true },
  });
}

/** Existencia + posse, usado por `features/workout-sheets` para validar referencias. */
export async function exerciseReferenceExists(
  userId: string,
  ref: { exerciseId?: string; customExerciseId?: string },
): Promise<boolean> {
  if (ref.exerciseId) {
    const exercise = await prisma.exercise.findFirst({
      where: { id: ref.exerciseId, isActive: true },
      select: { id: true },
    });

    return exercise !== null;
  }

  if (ref.customExerciseId) {
    const custom = await prisma.customExercise.findFirst({
      where: { id: ref.customExerciseId, userId, deletedAt: null },
      select: { id: true },
    });

    return custom !== null;
  }

  return false;
}

/** Catalogo inclusive desativado: o historico de um exercicio desativado continua consultavel. */
export function findCatalogExerciseById(id: string): Promise<{ id: string; name: string } | null> {
  return prisma.exercise.findUnique({ where: { id }, select: { id: true, name: true } });
}

const lastSessionExerciseInclude = {
  session: { include: { sheet: { select: { name: true } } } },
  sets: { orderBy: { setNumber: 'asc' } },
} satisfies Prisma.SessionExerciseInclude;

export type LastSessionExerciseRow = Prisma.SessionExerciseGetPayload<{
  include: typeof lastSessionExerciseInclude;
}>;

/**
 * Ocorrencia mais recente (por `performedAt`) do exercicio nas sessoes do usuario, ignorando
 * ocorrencias sem series. Se o exercicio aparece duas vezes na mesma sessao, vale a primeira
 * pela ordem da sessao.
 */
export function findLastSessionExercise(
  userId: string,
  ref: { exerciseId?: string; customExerciseId?: string },
  excludeSessionId?: string,
): Promise<LastSessionExerciseRow | null> {
  return prisma.sessionExercise.findFirst({
    where: {
      ...(ref.exerciseId
        ? { exerciseId: ref.exerciseId }
        : { customExerciseId: ref.customExerciseId }),
      sets: { some: {} },
      session: { userId, ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}) },
    },
    orderBy: [
      { session: { performedAt: 'desc' } },
      { session: { createdAt: 'desc' } },
      { sortOrder: 'asc' },
    ],
    include: lastSessionExerciseInclude,
  });
}

export function insertExerciseReport(data: {
  userId: string;
  exerciseId: string;
  text: string;
}): Promise<ExerciseReport> {
  return prisma.exerciseReport.create({ data });
}
