import { prisma, type TransactionClient } from '../../../shared/db/client.js';
import type { Prisma } from '../../../generated/prisma/client.js';

export type AuditLogRow = Prisma.AdminAuditLogGetPayload<{
  include: { actor: { select: { id: true; email: true } } };
}>;

export interface AuditLogInsert {
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata?: Prisma.InputJsonValue;
}

export interface AuditLogCriteria {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
}

export interface AuditLogFilter extends AuditLogCriteria {
  page: number;
  limit: number;
}

const actorInclude = { actor: { select: { id: true, email: true } } } as const;

// `id` desempata linhas gravadas no mesmo milissegundo, mantendo a paginacao estavel
const newestFirst: Prisma.AdminAuditLogOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

function auditWhere(filter: AuditLogCriteria): Prisma.AdminAuditLogWhereInput {
  return {
    ...(filter.actorId ? { actorId: filter.actorId } : {}),
    ...(filter.action ? { action: filter.action } : {}),
    ...(filter.targetType ? { targetType: filter.targetType } : {}),
    ...(filter.targetId ? { targetId: filter.targetId } : {}),
    ...(filter.from || filter.to
      ? {
          createdAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lte: filter.to } : {}),
          },
        }
      : {}),
  };
}

export async function insertAuditLog(db: TransactionClient, entry: AuditLogInsert): Promise<void> {
  await db.adminAuditLog.create({ data: entry });
}

export async function listAuditLogs(
  filter: AuditLogFilter,
): Promise<{ items: AuditLogRow[]; total: number }> {
  const where = auditWhere(filter);

  const [items, total] = await prisma.$transaction([
    prisma.adminAuditLog.findMany({
      where,
      include: actorInclude,
      orderBy: newestFirst,
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  return { items, total };
}

/** Linhas para exportacao: mesmos filtros da listagem, mais recentes primeiro, ate `max`. */
export async function listAuditLogsForExport(
  filter: AuditLogCriteria,
  max: number,
): Promise<{ items: AuditLogRow[]; total: number }> {
  const where = auditWhere(filter);

  const [items, total] = await prisma.$transaction([
    prisma.adminAuditLog.findMany({
      where,
      include: actorInclude,
      orderBy: newestFirst,
      take: max,
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  return { items, total };
}
