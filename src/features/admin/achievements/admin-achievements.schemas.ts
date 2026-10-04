import { z } from 'zod';

import { achievementCriteriaSchema } from '../../../shared/gamification/index.js';
import {
  activeStatusFilterSchema,
  mediaUploadSchema,
  paginated,
  paginationQuerySchema,
} from '../admin.schemas.js';

const nameSchema = z.string().trim().min(1).max(120);
const descriptionSchema = z.string().trim().max(500);

export const listAchievementsQuerySchema = paginationQuerySchema.extend({
  q: z.string().min(1).optional().describe('Busca por nome'),
  status: activeStatusFilterSchema,
});

export const createAchievementBodySchema = z.object({
  name: nameSchema,
  description: descriptionSchema.optional(),
  criteria: achievementCriteriaSchema,
  isActive: z.boolean().default(true),
  icon: mediaUploadSchema.optional(),
});

export const updateAchievementBodySchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.nullable().optional().describe('null remove a descricao'),
    criteria: achievementCriteriaSchema.optional(),
    isActive: z.boolean().optional(),
    icon: mediaUploadSchema.optional().describe('Substitui o icone'),
    iconUrl: z.null().optional().describe('Somente null (remove o icone)'),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'Envie ao menos um campo',
  })
  .refine((data) => !(data.icon && data.iconUrl === null), {
    message: 'Envie icon OU iconUrl: null, nao ambos',
    path: ['iconUrl'],
  });

export const achievementResponseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  iconUrl: z.string().nullable(),
  criteria: achievementCriteriaSchema,
  isActive: z.boolean(),
  unlockCount: z.int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const achievementListResponseSchema = paginated(achievementResponseSchema);

export const achievementUnlockListResponseSchema = paginated(
  z.object({
    userId: z.uuid(),
    email: z.string(),
    displayName: z.string().nullable(),
    unlockedAt: z.iso.datetime(),
  }),
);

export type ListAchievementsQuery = z.infer<typeof listAchievementsQuerySchema>;
export type CreateAchievementBody = z.infer<typeof createAchievementBodySchema>;
export type UpdateAchievementBody = z.infer<typeof updateAchievementBodySchema>;
export type AchievementDto = z.infer<typeof achievementResponseSchema>;
export type AchievementUnlockDto = z.infer<
  typeof achievementUnlockListResponseSchema
>['items'][number];
