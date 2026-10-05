import { z } from 'zod';

import { ROLES } from '../../../shared/auth/index.js';
import { paginated, paginationQuerySchema } from '../admin.schemas.js';

const USER_STATUSES = ['active', 'inactive', 'banned'] as const;
const ADMIN_ROLES = ['admin', 'super_user'] as const;

const reasonSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .optional()
  .describe('Motivo registrado no audit log');

export const listUsersQuerySchema = paginationQuerySchema.extend({
  q: z.string().min(1).optional().describe('Busca em email e nome de exibicao'),
  status: z.enum(USER_STATUSES).optional(),
  role: z.enum(ROLES).optional(),
});

export const listAdminsQuerySchema = paginationQuerySchema.extend({
  q: z.string().min(1).optional().describe('Busca em email e nome de exibicao'),
  role: z.enum(ADMIN_ROLES).optional().describe('Default: admin e super_user'),
  status: z.enum(USER_STATUSES).optional(),
});

export const updateUserStatusBodySchema = z.object({
  status: z.enum(USER_STATUSES),
  reason: reasonSchema,
});

export const promoteUserBodySchema = z.object({
  role: z.literal('admin').describe('Esta rota so promove user -> admin'),
  reason: reasonSchema,
});

export const updateAdminRoleBodySchema = z.object({
  role: z.enum(ROLES).describe('user revoga o acesso admin; super_user promove; admin rebaixa'),
  reason: reasonSchema,
});

export const adminUserSummarySchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: z.enum(ROLES),
  status: z.enum(USER_STATUSES),
  displayName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastActivityAt: z.iso
    .datetime()
    .nullable()
    .describe('performedAt mais recente entre sessoes e atividades livres ("ultimo treino")'),
});

export const adminUserDetailSchema = adminUserSummarySchema.extend({
  updatedAt: z.iso.datetime(),
  authMethods: z.object({
    password: z.boolean(),
    oauthProvider: z.enum(['google', 'apple']).nullable(),
  }),
  profile: z.object({
    timezone: z.string(),
    weightKg: z.number().nullable(),
    heightCm: z.number().nullable(),
    onboardingCompletedAt: z.iso.datetime().nullable(),
  }),
  stats: z.object({
    workoutSheets: z.int().describe('Planilhas nao removidas'),
    workoutSessions: z.int(),
    completedWorkoutSessions: z.int(),
    freeActivities: z.int(),
    customExercises: z.int().describe('Exercicios personalizados nao removidos'),
    achievementsUnlocked: z.int(),
    challengesJoined: z.int(),
    lastActivityAt: z.iso
      .datetime()
      .nullable()
      .describe('performedAt mais recente entre sessoes e atividades livres'),
  }),
});

export const adminUserListResponseSchema = paginated(adminUserSummarySchema);

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type ListAdminsQuery = z.infer<typeof listAdminsQuerySchema>;
export type UpdateUserStatusBody = z.infer<typeof updateUserStatusBodySchema>;
export type AdminUserSummary = z.infer<typeof adminUserSummarySchema>;
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;
