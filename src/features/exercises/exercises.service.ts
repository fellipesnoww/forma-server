import { AppError } from '../../shared/errors/index.js';
import {
  createCustomExercise,
  exerciseReferenceExists,
  findCatalogExercises,
  findCustomExerciseById,
  findCustomExercises,
  findMuscleGroupBySlug,
  softDeleteCustomExercise,
  updateCustomExercise,
  type CatalogExerciseRow,
  type CustomExerciseRow,
} from './exercises.repository.js';
import type { CreateCustomExerciseBody, UpdateCustomExerciseBody } from './exercises.schemas.js';

export interface ExerciseDto {
  id: string;
  name: string;
  muscleGroup: string | null;
  source: 'catalog' | 'custom';
  isActive: boolean;
  mediaUrl: string | null;
}

function fromCatalog(exercise: CatalogExerciseRow): ExerciseDto {
  return {
    id: exercise.id,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup?.name ?? null,
    source: 'catalog',
    isActive: exercise.isActive,
    mediaUrl: exercise.mediaUrl,
  };
}

function fromCustom(exercise: CustomExerciseRow): ExerciseDto {
  return {
    id: exercise.id,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup?.name ?? null,
    source: 'custom',
    isActive: true,
    mediaUrl: null,
  };
}

async function resolveMuscleGroupId(slug: string | undefined): Promise<string | undefined> {
  if (!slug) {
    return undefined;
  }

  const muscleGroup = await findMuscleGroupBySlug(slug);

  if (!muscleGroup) {
    throw AppError.badRequest(`Grupo muscular '${slug}' nao existe`);
  }

  return muscleGroup.id;
}

export async function listExercises(
  userId: string,
  filter: { muscleGroupSlug?: string; search?: string },
): Promise<ExerciseDto[]> {
  const [catalog, custom] = await Promise.all([
    findCatalogExercises(filter),
    findCustomExercises(userId, filter),
  ]);

  return [...catalog.map(fromCatalog), ...custom.map(fromCustom)];
}

export async function addCustomExercise(
  userId: string,
  input: CreateCustomExerciseBody,
): Promise<ExerciseDto> {
  const muscleGroupId = await resolveMuscleGroupId(input.muscleGroupSlug);

  return fromCustom(await createCustomExercise(userId, { name: input.name, muscleGroupId }));
}

async function requireOwnedCustomExercise(userId: string, id: string): Promise<CustomExerciseRow> {
  const exercise = await findCustomExerciseById(id);

  if (!exercise || exercise.deletedAt) {
    throw AppError.notFound('Exercicio personalizado nao encontrado');
  }

  if (exercise.userId !== userId) {
    throw AppError.forbidden('Exercicio personalizado pertence a outro usuario');
  }

  return exercise;
}

export async function editCustomExercise(
  userId: string,
  id: string,
  input: UpdateCustomExerciseBody,
): Promise<ExerciseDto> {
  await requireOwnedCustomExercise(userId, id);

  const muscleGroupId = await resolveMuscleGroupId(input.muscleGroupSlug);

  return fromCustom(
    await updateCustomExercise(id, {
      ...(input.name ? { name: input.name } : {}),
      ...(input.muscleGroupSlug ? { muscleGroupId } : {}),
    }),
  );
}

export async function removeCustomExercise(userId: string, id: string): Promise<void> {
  await requireOwnedCustomExercise(userId, id);
  await softDeleteCustomExercise(id);
}

/** Usado por `features/workout-sheets` para validar `exerciseId`/`customExerciseId`. */
export function exerciseRefExists(
  userId: string,
  ref: { exerciseId?: string; customExerciseId?: string },
): Promise<boolean> {
  return exerciseReferenceExists(userId, ref);
}
