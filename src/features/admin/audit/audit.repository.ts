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

export interface AuditLogFilter {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

export async function insertAuditLog(db: TransactionClient, entry: AuditLogInsert): Promise<void> {
  await db.adminAuditLog.create({ data: entry });
}

export async function listAuditLogs(
  filter: AuditLogFilter,
): Promise<{ items: AuditLogRow[]; total: number }> {
  const where: Prisma.AdminAuditLogWhereInput = {
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

  const [items, total] = await prisma.$transaction([
    prisma.adminAuditLog.findMany({
      where,
      include: { actor: { select: { id: true, email: true } } },
      // `id` desempata linhas gravadas no mesmo milissegundo, mantendo a paginacao estavel
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    }),
    prisma.adminAuditLog.count({ where }),
  ]);

  return { items, total };
}
