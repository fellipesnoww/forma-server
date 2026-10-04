import { z } from 'zod';

/**
 * Formatos dos JSONs `achievements.criteria` e `challenges.goal`. Ficam em `shared/` porque
 * tem tres consumidores: o painel admin (Fase 3.5, valida o que e gravado), o motor de
 * conquistas (Fase 4.1) e o progresso de desafios (Fase 4.2), que interpretam o mesmo JSON.
 * Tipo novo de criterio/meta entra aqui primeiro.
 */

export const ACHIEVEMENT_CRITERIA_TYPES = [
  'streak_days',
  'workout_count',
  'challenge_complete',
] as const;

export const achievementCriteriaSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('streak_days'),
      days: z.int().min(1).max(3650).describe('Dias consecutivos com treino ou atividade'),
    }),
    z.object({
      type: z.literal('workout_count'),
      count: z.int().min(1).max(100_000).describe('Sessoes de treino concluidas'),
    }),
    z.object({
      type: z.literal('challenge_complete'),
      challengeId: z.uuid().describe('Desafio que precisa ser concluido'),
    }),
  ])
  .describe('Criterio de desbloqueio, discriminado por `type`');

export const CHALLENGE_GOAL_TYPES = [
  'workout_count',
  'activity_count',
  'activity_minutes',
] as const;

const goalActivityTypeSchema = z
  .uuid()
  .optional()
  .describe('Restringe a um tipo de atividade padrao; omitido = qualquer tipo');

export const challengeGoalSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('workout_count'),
      count: z.int().min(1).max(100_000).describe('Sessoes de treino concluidas no periodo'),
    }),
    z.object({
      type: z.literal('activity_count'),
      count: z.int().min(1).max(100_000).describe('Atividades livres registradas no periodo'),
      activityTypeId: goalActivityTypeSchema,
    }),
    z.object({
      type: z.literal('activity_minutes'),
      minutes: z.int().min(1).max(1_000_000).describe('Soma de durationMinutes no periodo'),
      activityTypeId: goalActivityTypeSchema,
    }),
  ])
  .describe('Meta do desafio, discriminada por `type`');

export type AchievementCriteria = z.infer<typeof achievementCriteriaSchema>;
export type ChallengeGoal = z.infer<typeof challengeGoalSchema>;
