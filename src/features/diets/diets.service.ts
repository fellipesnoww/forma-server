import type { FastifyBaseLogger } from 'fastify';

import { AppError } from '../../shared/errors/index.js';
import { CalorieEstimatorError, getCalorieEstimator } from './calorie-estimator/index.js';
import {
  createDiet,
  deleteDiet,
  findActiveDiet,
  findDiet,
  listDiets,
  replaceDiet,
  setActiveDiet,
  type DietDetailRow,
} from './diets.repository.js';
import type {
  CalorieEstimateBody,
  CalorieEstimateResponse,
  CreateDietBody,
  DietDetail,
  DietSummary,
  UpdateDietBody,
} from './diets.schemas.js';

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function toDetail(diet: DietDetailRow): DietDetail {
  const meals = diet.meals.map((meal) => ({
    id: meal.id,
    name: meal.name,
    time: meal.time,
    totalKcal: sum(meal.foods.map((food) => food.kcal)),
    foodCount: meal.foods.length,
    foods: meal.foods.map((food) => ({
      id: food.id,
      name: food.name,
      quantity: food.quantity,
      unit: food.unit,
      kcal: food.kcal,
    })),
  }));

  return {
    id: diet.id,
    name: diet.name,
    goal: diet.goal,
    isActive: diet.isActive,
    totalKcal: sum(meals.map((meal) => meal.totalKcal)),
    mealCount: meals.length,
    foodCount: sum(meals.map((meal) => meal.foodCount)),
    createdAt: diet.createdAt.toISOString(),
    updatedAt: diet.updatedAt.toISOString(),
    meals,
  };
}

function toSummary(diet: DietDetailRow): DietSummary {
  const detail = toDetail(diet);

  return { ...detail, meals: detail.meals.map(({ foods: _foods, ...meal }) => meal) };
}

async function requireDiet(userId: string, id: string): Promise<DietDetailRow> {
  const diet = await findDiet(userId, id);

  if (!diet) {
    throw AppError.notFound('Dieta nao encontrada');
  }

  return diet;
}

export async function getDiets(userId: string): Promise<DietSummary[]> {
  return (await listDiets(userId)).map(toSummary);
}

export async function getDiet(userId: string, id: string): Promise<DietDetail> {
  return toDetail(await requireDiet(userId, id));
}

/** Usado por `features/auth` (`GET /auth/me`): a dieta ativa ou `null`. */
export async function getActiveDietSummary(userId: string): Promise<DietSummary | null> {
  const diet = await findActiveDiet(userId);

  return diet ? toSummary(diet) : null;
}

export async function addDiet(userId: string, input: CreateDietBody): Promise<DietDetail> {
  return toDetail(await createDiet(userId, input));
}

export async function editDiet(
  userId: string,
  id: string,
  input: UpdateDietBody,
): Promise<DietDetail> {
  await requireDiet(userId, id);

  return toDetail(await replaceDiet(id, input));
}

export async function removeDiet(userId: string, id: string): Promise<void> {
  await requireDiet(userId, id);
  await deleteDiet(id);
}

/** Idempotente: ativar a dieta ja ativa (ou desativar uma inativa) devolve 200 sem mudanca. */
export async function changeDietActivation(
  userId: string,
  id: string,
  active: boolean,
): Promise<DietDetail> {
  const diet = await requireDiet(userId, id);

  if (diet.isActive !== active) {
    await setActiveDiet(userId, id, active);
  }

  return getDiet(userId, id);
}

/**
 * Sugestao de calorias por IA. O valor nao e gravado: o client preenche o campo e o
 * usuario revisa antes de salvar a dieta. Falha do provedor vira 503 (detalhe so no log).
 */
export async function estimateCalories(
  input: CalorieEstimateBody,
  log: FastifyBaseLogger,
): Promise<CalorieEstimateResponse> {
  const estimator = getCalorieEstimator();

  if (!estimator) {
    throw AppError.serviceUnavailable('Estimativa de calorias por IA nao esta configurada');
  }

  try {
    const output = await estimator.estimate(input);

    if (!output.recognized) {
      throw AppError.badRequest(`"${input.name}" nao foi reconhecido como alimento`);
    }

    return {
      kcal: Math.max(0, output.kcal),
      notes: output.notes,
      provider: estimator.provider,
      model: estimator.model,
    };
  } catch (error) {
    if (error instanceof CalorieEstimatorError) {
      log.warn({ err: error, provider: estimator.provider }, 'calorie estimate failed');

      throw AppError.serviceUnavailable('Estimativa de calorias indisponivel no momento', {
        provider: estimator.provider,
      });
    }

    throw error;
  }
}
