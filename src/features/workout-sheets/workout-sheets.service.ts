import { exerciseRefExists } from '../exercises/index.js';
import { AppError } from '../../shared/errors/index.js';
import {
  countSheetExercisesInDay,
  createSheet,
  findDayWithSheet,
  findSheetById,
  findSheetDetail,
  listSheets,
  reorderSheetExercises,
  replaceSheet,
  softDeleteSheet,
  type SheetDayInput,
  type SheetDetailRow,
  type SheetSummaryRow,
} from './workout-sheets.repository.js';
import type {
  CreateWorkoutSheetBody,
  ReorderExercisesBody,
  UpdateWorkoutSheetBody,
} from './workout-sheets.schemas.js';

export interface SheetExerciseDto {
  id: string;
  exerciseId: string | null;
  customExerciseId: string | null;
  name: string;
  sortOrder: number;
  targetSets: number | null;
  targetReps: number | null;
}

export interface SheetDayDto {
  id: string;
  weekday: number;
  order: number;
  exercises: SheetExerciseDto[];
}

export interface SheetDetailDto {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  days: SheetDayDto[];
}

export interface SheetSummaryDto {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

function toSummaryDto(sheet: SheetSummaryRow): SheetSummaryDto {
  return {
    id: sheet.id,
    name: sheet.name,
    createdAt: sheet.createdAt.toISOString(),
    updatedAt: sheet.updatedAt.toISOString(),
  };
}

function toDetailDto(sheet: SheetDetailRow): SheetDetailDto {
  return {
    ...toSummaryDto(sheet),
    days: sheet.days.map((day) => ({
      id: day.id,
      weekday: day.weekday,
      order: day.order,
      exercises: day.exercises.map((exercise) => ({
        id: exercise.id,
        exerciseId: exercise.exerciseId,
        customExerciseId: exercise.customExerciseId,
        name: exercise.exercise?.name ?? exercise.customExercise?.name ?? '',
        sortOrder: exercise.sortOrder,
        targetSets: exercise.targetSets,
        targetReps: exercise.targetReps,
      })),
    })),
  };
}

/**
 * Cada exercicio referenciado precisa existir no catalogo (ativo) ou ser um custom exercise
 * do proprio usuario — sem isso um `exerciseId` de outro usuario ou desativado entraria na planilha.
 */
async function validateExerciseReferences(userId: string, days: SheetDayInput[]): Promise<void> {
  const refs = days.flatMap((day) => day.exercises);

  await Promise.all(
    refs.map(async (ref) => {
      const exists = await exerciseRefExists(userId, ref);

      if (!exists) {
        throw AppError.badRequest(
          `Exercicio ${ref.exerciseId ?? ref.customExerciseId ?? ''} nao encontrado ou nao pertence ao usuario`,
        );
      }
    }),
  );
}

export async function getSheets(userId: string): Promise<SheetSummaryDto[]> {
  return (await listSheets(userId)).map(toSummaryDto);
}

/**
 * Usado por `workout-sessions` (via `index.ts`) para validar o `sheetId` de uma nova sessao:
 * planilha removida ou de outro usuario conta como inexistente.
 */
export async function activeSheetBelongsToUser(userId: string, sheetId: string): Promise<boolean> {
  return (await findSheetById(userId, sheetId)) !== null;
}

async function requireSheetDetail(userId: string, id: string): Promise<SheetDetailRow> {
  const sheet = await findSheetDetail(userId, id);

  if (!sheet) {
    throw AppError.notFound('Planilha nao encontrada');
  }

  return sheet;
}

export async function getSheetDetail(userId: string, id: string): Promise<SheetDetailDto> {
  return toDetailDto(await requireSheetDetail(userId, id));
}

export async function addSheet(
  userId: string,
  input: CreateWorkoutSheetBody,
): Promise<SheetDetailDto> {
  await validateExerciseReferences(userId, input.days);

  return toDetailDto(await createSheet(userId, input));
}

export async function editSheet(
  userId: string,
  id: string,
  input: UpdateWorkoutSheetBody,
): Promise<SheetDetailDto> {
  await requireSheetDetail(userId, id);

  if (input.days) {
    await validateExerciseReferences(userId, input.days);
  }

  return toDetailDto(await replaceSheet(id, input));
}

export async function removeSheet(userId: string, id: string): Promise<void> {
  await requireSheetDetail(userId, id);
  await softDeleteSheet(id);
}

export async function reorderSheetDayExercises(
  userId: string,
  sheetId: string,
  input: ReorderExercisesBody,
): Promise<SheetDetailDto> {
  await requireSheetDetail(userId, sheetId);

  const day = await findDayWithSheet(input.dayId);

  if (!day || day.sheetId !== sheetId || day.sheet.userId !== userId) {
    throw AppError.notFound('Dia da planilha nao encontrado');
  }

  const ids = input.exercises.map((exercise) => exercise.id);
  const matchCount = await countSheetExercisesInDay(input.dayId, ids);

  if (matchCount !== ids.length) {
    throw AppError.badRequest('Um ou mais exercicios nao pertencem a esse dia');
  }

  await reorderSheetExercises(input.dayId, input.exercises);

  return getSheetDetail(userId, sheetId);
}
