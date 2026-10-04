import { prisma, type TransactionClient } from '../../../shared/db/client.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { Page } from '../admin.schemas.js';
import { insertAuditLog, listAuditLogs, type AuditLogRow } from './audit.repository.js';
import type {
  AuditAction,
  AuditLogDto,
  AuditTargetType,
  ListAuditLogsQuery,
} from './audit.schemas.js';

export interface AuditEntry {
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string | null;
  metadata?: Prisma.InputJsonValue;
}

export type AuditLogger = (entry: AuditEntry) => Promise<void>;

/**
 * Executa uma mutacao admin e grava o audit log na MESMA transacao: se o log falhar a
 * alteracao e desfeita, e vice-versa — nao existe acao admin sem rastro nem rastro de acao
 * que nao aconteceu. `fn` deve usar o `tx` recebido para toda escrita.
 *
 * Quando `fn` decide que nao ha nada a fazer (ex.: status ja era o pedido) basta nao chamar
 * `log`: nenhuma linha e gravada.
 */
export function runAudited<T>(
  actorId: string | null,
  fn: (tx: TransactionClient, log: AuditLogger) => Promise<T>,
): Promise<T> {
  return prisma.$transaction((tx) => fn(tx, (entry) => insertAuditLog(tx, { actorId, ...entry })));
}

function toDto(row: AuditLogRow): AuditLogDto {
  return {
    id: row.id,
    actor: row.actor ? { id: row.actor.id, email: row.actor.email } : null,
    action: row.action as AuditAction,
    targetType: row.targetType as AuditTargetType,
    targetId: row.targetId,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getAuditLogs(query: ListAuditLogsQuery): Promise<Page<AuditLogDto>> {
  const { items, total } = await listAuditLogs({
    ...query,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  });

  return { items: items.map(toDto), total, page: query.page, limit: query.limit };
}
