import { z } from 'zod';

import { paginated, paginationQuerySchema } from '../admin.schemas.js';

/**
 * Catalogo fechado de acoes auditadas. E contrato com o painel (filtro `?action=`), entao
 * acao nova entra aqui antes de ser gravada.
 */
export const AUDIT_ACTIONS = [
  'exercise.created',
  'exercise.updated',
  'exercise.status_changed',
  'muscle_group.created',
  'muscle_group.updated',
  'user.status_changed',
  'user.role_changed',
  'achievement.created',
  'achievement.updated',
  'achievement.deleted',
  'challenge.created',
  'challenge.updated',
  'challenge.deleted',
] as const;

export const AUDIT_TARGET_TYPES = [
  'exercise',
  'muscle_group',
  'user',
  'achievement',
  'challenge',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export const listAuditLogsQuerySchema = paginationQuerySchema.extend({
  actorId: z.uuid().optional().describe('Admin que executou a acao'),
  action: z.enum(AUDIT_ACTIONS).optional(),
  targetType: z.enum(AUDIT_TARGET_TYPES).optional(),
  targetId: z.uuid().optional(),
  from: z.iso.datetime({ offset: true }).optional().describe('createdAt >= from'),
  to: z.iso.datetime({ offset: true }).optional().describe('createdAt <= to'),
});

const auditLogSchema = z.object({
  id: z.uuid(),
  actor: z
    .object({ id: z.uuid(), email: z.string() })
    .nullable()
    .describe('null = acao feita fora da API (CLI) ou conta do admin removida'),
  action: z.enum(AUDIT_ACTIONS),
  targetType: z.enum(AUDIT_TARGET_TYPES),
  targetId: z.uuid().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.iso.datetime(),
});

export const auditLogListResponseSchema = paginated(auditLogSchema);

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
export type AuditLogDto = z.infer<typeof auditLogSchema>;
