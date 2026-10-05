import { z } from 'zod';

import { FOOD_UNITS, MAX_FOOD_KCAL } from './calorie-estimator/index.js';

const MAX_MEALS = 20;
const MAX_FOODS_PER_MEAL = 50;

const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (00:00 a 23:59)')
  .describe('Horario local da refeicao, HH:mm');

const foodNameSchema = z.string().trim().min(1).max(120);
const quantitySchema = z.number().positive().max(100_000);
const unitSchema = z.enum(FOOD_UNITS).describe('G, KG, ML ou L');

const foodInputSchema = z.object({
  name: foodNameSchema,
  quantity: quantitySchema,
  unit: unitSchema,
  kcal: z
    .number()
    .int()
    .min(0)
    .max(MAX_FOOD_KCAL)
    .describe(
      'Calorias da porcao inteira (digitadas ou sugeridas por POST /diets/calorie-estimate)',
    ),
});

const mealInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  time: timeSchema,
  foods: z
    .array(foodInputSchema)
    .max(MAX_FOODS_PER_MEAL)
    .default([])
    .describe('Ordem do array = ordem de exibicao'),
});

const mealsInputSchema = z
  .array(mealInputSchema)
  .max(MAX_MEALS)
  .describe('Refeicoes da dieta; voltam ordenadas por horario');

const goalSchema = z.string().trim().min(1).max(255).describe('Objetivo, texto livre');

export const createDietBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  goal: goalSchema.optional(),
  meals: mealsInputSchema.default([]),
});

export const updateDietBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    goal: goalSchema.nullable().optional().describe('null remove o objetivo'),
    meals: mealsInputSchema.optional().describe('Substitui todas as refeicoes e alimentos'),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Envie ao menos um campo',
  });

export const dietIdParamsSchema = z.object({ id: z.uuid() });

export const calorieEstimateBodySchema = z.object({
  name: foodNameSchema.describe('Nome do alimento, ex.: "arroz branco cozido"'),
  quantity: quantitySchema,
  unit: unitSchema,
});

const foodSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  quantity: z.number(),
  unit: z.enum(FOOD_UNITS),
  kcal: z.int(),
});

const mealBaseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  time: z.string(),
  totalKcal: z.int().describe('Soma das calorias dos alimentos da refeicao'),
  foodCount: z.int(),
});

const dietBaseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  goal: z.string().nullable(),
  isActive: z.boolean().describe('No maximo uma dieta ativa por usuario'),
  totalKcal: z.int().describe('Total aproximado do dia: soma de todos os alimentos'),
  mealCount: z.int(),
  foodCount: z.int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const dietSummarySchema = dietBaseSchema.extend({
  meals: z.array(mealBaseSchema).describe('Refeicoes sem os alimentos, por horario'),
});

export const dietDetailSchema = dietBaseSchema.extend({
  meals: z.array(mealBaseSchema.extend({ foods: z.array(foodSchema) })),
});

export const dietListResponseSchema = z.object({
  items: z.array(dietSummarySchema).describe('Ativa primeiro, depois as mais recentes'),
});

export const calorieEstimateResponseSchema = z.object({
  kcal: z.int(),
  notes: z.string().describe('Base da estimativa, para o usuario revisar'),
  provider: z.enum(['anthropic', 'gemini']),
  model: z.string(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type CreateDietBody = z.infer<typeof createDietBodySchema>;
export type UpdateDietBody = z.infer<typeof updateDietBodySchema>;
export type CalorieEstimateBody = z.infer<typeof calorieEstimateBodySchema>;
export type DietSummary = z.infer<typeof dietSummarySchema>;
export type DietDetail = z.infer<typeof dietDetailSchema>;
export type CalorieEstimateResponse = z.infer<typeof calorieEstimateResponseSchema>;
