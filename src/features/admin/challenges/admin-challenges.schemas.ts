import { z } from 'zod';

import { challengeGoalSchema } from '../../../shared/gamification/index.js';
import { activeStatusFilterSchema, paginated, paginationQuerySchema } from '../admin.schemas.js';

export const CHALLENGE_PERIODS = ['upcoming', 'ongoing', 'ended'] as const;

const nameSchema = z.string().trim().min(1).max(120);
const descriptionSchema = z.string().trim().max(1000);
const rewardSchema = z.string().trim().min(1).max(255);
const instantSchema = z.iso.datetime({ offset: true });

export const listChallengesQuerySchema = paginationQuerySchema.extend({
  q: z.string().min(1).optional().describe('Busca por nome'),
  status: activeStatusFilterSchema,
  period: z
    .enum(CHALLENGE_PERIODS)
    .optional()
    .describe('upcoming: startsAt > agora; ongoing: em andamento; ended: endsAt <= agora'),
});

export const createChallengeBodySchema = z
  .object({
    name: nameSchema,
    description: descriptionSchema.optional(),
    goal: challengeGoalSchema,
    reward: rewardSchema.optional().describe('Texto livre exibido ao usuario'),
    startsAt: instantSchema,
    endsAt: instantSchema.describe('Exclusivo; precisa ser depois de startsAt'),
    isActive: z.boolean().default(true),
  })
  .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), {
    message: 'endsAt precisa ser depois de startsAt',
    path: ['endsAt'],
  });

export const updateChallengeBodySchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    goal: challengeGoalSchema
      .optional()
      .describe('Bloqueado (409) depois que alguem entrou no desafio'),
    reward: rewardSchema.nullable().optional(),
    startsAt: instantSchema.optional(),
    endsAt: instantSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Envie ao menos um campo',
  });

export const challengeResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  goal: challengeGoalSchema,
  reward: z.string().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  isActive: z.boolean(),
  period: z.enum(CHALLENGE_PERIODS).describe('Calculado no momento da resposta'),
  participantCount: z.int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const challengeListResponseSchema = paginated(challengeResponseSchema);

export type ChallengePeriod = (typeof CHALLENGE_PERIODS)[number];
export type ListChallengesQuery = z.infer<typeof listChallengesQuerySchema>;
export type CreateChallengeBody = z.infer<typeof createChallengeBodySchema>;
export type UpdateChallengeBody = z.infer<typeof updateChallengeBodySchema>;
export type ChallengeDto = z.infer<typeof challengeResponseSchema>;
