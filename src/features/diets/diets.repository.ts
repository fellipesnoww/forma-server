import { prisma } from '../../shared/db/client.js';
import type { FoodUnit, Prisma } from '../../generated/prisma/client.js';

const dietDetailInclude = {
  meals: {
    orderBy: [{ time: 'asc' }, { sortOrder: 'asc' }],
    include: { foods: { orderBy: { sortOrder: 'asc' } } },
  },
} satisfies Prisma.DietInclude;

export type DietDetailRow = Prisma.DietGetPayload<{ include: typeof dietDetailInclude }>;

export interface DietMealInput {
  name: string;
  time: string;
  foods: { name: string; quantity: number; unit: FoodUnit; kcal: number }[];
}

function mealsCreateInput(meals: DietMealInput[]): Prisma.DietMealCreateWithoutDietInput[] {
  return meals.map((meal, mealIndex) => ({
    name: meal.name,
    time: meal.time,
    sortOrder: mealIndex,
    foods: {
      create: meal.foods.map((food, foodIndex) => ({ ...food, sortOrder: foodIndex })),
    },
  }));
}

/**
 * Listagem carrega os alimentos tambem: o total calorico de cada dieta e por refeicao sai da
 * soma, e o volume por usuario e pequeno (poucas dietas, dezenas de alimentos).
 */
export function listDiets(userId: string): Promise<DietDetailRow[]> {
  return prisma.diet.findMany({
    where: { userId },
    include: dietDetailInclude,
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  });
}

export function findDiet(userId: string, id: string): Promise<DietDetailRow | null> {
  return prisma.diet.findFirst({ where: { id, userId }, include: dietDetailInclude });
}

export function findActiveDiet(userId: string): Promise<DietDetailRow | null> {
  return prisma.diet.findFirst({ where: { userId, isActive: true }, include: dietDetailInclude });
}

export function createDiet(
  userId: string,
  data: { name: string; goal?: string; meals: DietMealInput[] },
): Promise<DietDetailRow> {
  return prisma.diet.create({
    data: {
      userId,
      name: data.name,
      goal: data.goal,
      meals: { create: mealsCreateInput(data.meals) },
    },
    include: dietDetailInclude,
  });
}

/** Mesma estrategia das planilhas (1.4): `meals` substitui tudo, numa transacao. */
export async function replaceDiet(
  id: string,
  data: { name?: string; goal?: string | null; meals?: DietMealInput[] },
): Promise<DietDetailRow> {
  return prisma.$transaction(async (tx) => {
    if (data.meals !== undefined) {
      await tx.dietMeal.deleteMany({ where: { dietId: id } });
    }

    return tx.diet.update({
      where: { id },
      data: {
        name: data.name,
        goal: data.goal,
        ...(data.meals !== undefined ? { meals: { create: mealsCreateInput(data.meals) } } : {}),
      },
      include: dietDetailInclude,
    });
  });
}

export async function deleteDiet(id: string): Promise<void> {
  await prisma.diet.delete({ where: { id } });
}

/**
 * Ativa `id` e desativa as demais do usuario. A linha do usuario e travada (`FOR UPDATE`)
 * para serializar ativacoes concorrentes: sem isso, duas requisicoes simultaneas em dietas
 * diferentes poderiam deixar as duas ativas (nao ha indice unico parcial no schema).
 */
export async function setActiveDiet(userId: string, id: string, active: boolean): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;

    if (active) {
      await tx.diet.updateMany({
        where: { userId, isActive: true, id: { not: id } },
        data: { isActive: false },
      });
    }

    await tx.diet.update({ where: { id }, data: { isActive: active } });
  });
}
