import { AppError } from '../../shared/errors/index.js';
import {
  createCustomExercise,
  exerciseReferenceExists,
  findCatalogExerciseById,
  findCatalogExercises,
  findCustomExerciseById,
  findCustomExercises,
  findLastSessionExercise,
  findMuscleGroupBySlug,
  insertExerciseReport,
  softDeleteCustomExercise,
  updateCustomExercise,
  type CatalogExerciseRow,
  type CustomExerciseRow,
} from './exercises.repository.js';
import type {
  CreateCustomExerciseBody,
  CreateExerciseReportBody,
  ExerciseReportDto,
  LastSessionQuery,
  LastSessionResponse,
  UpdateCustomExerciseBody,
} from './exercises.schemas.js';

export interface ExerciseDto {
  id: string;
  name: string;
  muscleGroup: string | null;
  source: 'catalog' | 'custom';
  isActive: boolean;
  mediaUrl: string | null;
  femaleMediaUrl: string | null;
}

function fromCatalog(exercise: CatalogExerciseRow): ExerciseDto {
  return {
    id: exercise.id,
    name: exercise.name,
    muscleGroup: exercise.muscleGroup?.name ?? null,
    source: 'catalog',
    isActive: exercise.isActive,
    mediaUrl: exercise.mediaUrl,
    femaleMediaUrl: exercise.femaleMediaUrl,
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
    femaleMediaUrl: null,
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

/**
 * `:id` aceita catalogo (inclusive desativado) ou custom do proprio usuario (inclusive removido),
 * para o historico continuar acessivel. Custom de outro usuario conta como inexistente (404).
 */
async function resolveExerciseRef(
  userId: string,
  id: string,
): Promise<{ exerciseId?: string; customExerciseId?: string; name: string }> {
  const catalog = await findCatalogExerciseById(id);

  if (catalog) {
    return { exerciseId: catalog.id, name: catalog.name };
  }

  const custom = await findCustomExerciseById(id);

  if (!custom || custom.userId !== userId) {
    throw AppError.notFound('Exercicio nao encontrado');
  }

  return { customExerciseId: custom.id, name: custom.name };
}

function topSet<T extends { weightKg: number; reps: number }>(sets: T[]): T {
  return sets.reduce((best, set) =>
    set.weightKg > best.weightKg || (set.weightKg === best.weightKg && set.reps > best.reps)
      ? set
      : best,
  );
}

export async function getLastSession(
  userId: string,
  id: string,
  query: LastSessionQuery,
): Promise<LastSessionResponse> {
  const { name, ...ref } = await resolveExerciseRef(userId, id);
  const row = await findLastSessionExercise(userId, ref, query.excludeSessionId);
  const base = {
    exerciseId: ref.exerciseId ?? null,
    customExerciseId: ref.customExerciseId ?? null,
    name,
  };

  if (!row) {
    return { ...base, lastSession: null };
  }

  const sets = row.sets.map((set) => ({
    setNumber: set.setNumber,
    reps: set.reps,
    weightKg: set.weightKg,
    completed: set.completed,
  }));
  const best = topSet(sets);

  return {
    ...base,
    lastSession: {
      sessionId: row.session.id,
      sheetId: row.session.sheetId,
      sheetName: row.session.sheet.name,
      performedAt: row.session.performedAt.toISOString(),
      completedAt: row.session.completedAt?.toISOString() ?? null,
      sets,
      suggestion: { weightKg: best.weightKg, reps: best.reps },
    },
  };
}

/** Usado por `features/workout-sheets` para validar `exerciseId`/`customExerciseId`. */
export function exerciseRefExists(
  userId: string,
  ref: { exerciseId?: string; customExerciseId?: string },
): Promise<boolean> {
  return exerciseReferenceExists(userId, ref);
}

/**
 * Report so vale para o catalogo (inclusive desativado): exercicio custom e do proprio usuario,
 * que ja pode corrigi-lo. Id custom ou inexistente -> 404.
 */
export async function addExerciseReport(
  userId: string,
  exerciseId: string,
  body: CreateExerciseReportBody,
): Promise<ExerciseReportDto> {
  if (!(await findCatalogExerciseById(exerciseId))) {
    throw AppError.notFound('Exercicio nao encontrado');
  }

  const row = await insertExerciseReport({ userId, exerciseId, text: body.text });

  return {
    id: row.id,
    exerciseId: row.exerciseId,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
  };
}
