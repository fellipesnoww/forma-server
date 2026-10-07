import { prisma, type TransactionClient } from '../../../shared/db/client.js';
import type { Prisma } from '../../../generated/prisma/client.js';

/**
 * Escrita no catalogo global (`exercises`, `muscle_groups`). `features/exercises/` so le o
 * catalogo e escreve exercicios custom; o painel e o unico escritor HTTP destas tabelas
 * (o outro e o seed).
 */

export type AdminExerciseRow = Prisma.ExerciseGetPayload<{ include: { muscleGroup: true } }>;
export type MuscleGroupRow = Prisma.MuscleGroupGetPayload<{
  include: { _count: { select: { exercises: true } } };
}>;

export interface AdminExerciseFilter {
  search?: string;
  muscleGroupSlug?: string;
  isActive?: boolean;
  page: number;
  limit: number;
}

export async function listExercises(
  filter: AdminExerciseFilter,
): Promise<{ items: AdminExerciseRow[]; total: number }> {
  const where: Prisma.ExerciseWhereInput = {
    ...(filter.isActive === undefined ? {} : { isActive: filter.isActive }),
    ...(filter.muscleGroupSlug ? { muscleGroup: { slug: filter.muscleGroupSlug } } : {}),
    ...(filter.search ? { name: { contains: filter.search, mode: 'insensitive' } } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.exercise.findMany({
      where,
      include: { muscleGroup: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
    prisma.exercise.count({ where }),
  ]);

  return { items, total };
}

export function findExercise(db: TransactionClient, id: string): Promise<AdminExerciseRow | null> {
  return db.exercise.findUnique({ where: { id }, include: { muscleGroup: true } });
}

/** Colisao de nome sem diferenciar maiusculas (o unique do banco e exato). */
export function findExerciseNamed(
  db: TransactionClient,
  name: string,
  exceptId?: string,
): Promise<{ id: string } | null> {
  return db.exercise.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
}

export function createExercise(
  db: TransactionClient,
  data: {
    name: string;
    muscleGroupId: string | null;
    isActive: boolean;
    mediaUrl: string | null;
    femaleMediaUrl: string | null;
  },
): Promise<AdminExerciseRow> {
  return db.exercise.create({ data, include: { muscleGroup: true } });
}

export function updateExercise(
  db: TransactionClient,
  id: string,
  data: {
    name?: string;
    muscleGroupId?: string | null;
    isActive?: boolean;
    mediaUrl?: string | null;
    femaleMediaUrl?: string | null;
  },
): Promise<AdminExerciseRow> {
  return db.exercise.update({ where: { id }, data, include: { muscleGroup: true } });
}

const withExerciseCount = { _count: { select: { exercises: true } } } as const;

export function listMuscleGroups(): Promise<MuscleGroupRow[]> {
  return prisma.muscleGroup.findMany({ include: withExerciseCount, orderBy: { name: 'asc' } });
}

export function findMuscleGroupBySlug(
  db: TransactionClient,
  slug: string,
): Promise<{ id: string; slug: string; name: string } | null> {
  return db.muscleGroup.findUnique({ where: { slug } });
}

export function findMuscleGroup(db: TransactionClient, id: string): Promise<MuscleGroupRow | null> {
  return db.muscleGroup.findUnique({ where: { id }, include: withExerciseCount });
}

export function findMuscleGroupNamed(
  db: TransactionClient,
  name: string,
  exceptId?: string,
): Promise<{ id: string } | null> {
  return db.muscleGroup.findFirst({
    where: {
      name: { equals: name, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
}

export function createMuscleGroup(
  db: TransactionClient,
  data: { name: string; slug: string },
): Promise<MuscleGroupRow> {
  return db.muscleGroup.create({ data, include: withExerciseCount });
}

export function updateMuscleGroup(
  db: TransactionClient,
  id: string,
  data: { name?: string; slug?: string },
): Promise<MuscleGroupRow> {
  return db.muscleGroup.update({ where: { id }, data, include: withExerciseCount });
}
