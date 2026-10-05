import { toCsv } from '../../../shared/csv/index.js';
import { prisma, type TransactionClient } from '../../../shared/db/client.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import type { Page } from '../admin.schemas.js';
import {
  insertAuditLog,
  listAuditLogs,
  listAuditLogsForExport,
  type AuditLogRow,
} from './audit.repository.js';
import type {
  AuditAction,
  AuditLogDto,
  AuditTargetType,
  ExportAuditLogsQuery,
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

/**
 * Teto de linhas por arquivo: o export monta o CSV em memoria, entao um filtro vazio sobre
 * anos de log nao pode virar uma resposta de centenas de MB. Acima disso o painel filtra por
 * periodo; `truncated` avisa o client.
 */
export const AUDIT_EXPORT_MAX_ROWS = 10_000;

const EXPORT_HEADER = [
  'createdAt',
  'actorId',
  'actorEmail',
  'action',
  'targetType',
  'targetId',
  'metadata',
];

export async function exportAuditLogsCsv(
  query: ExportAuditLogsQuery,
): Promise<{ csv: string; total: number; truncated: boolean }> {
  const { items, total } = await listAuditLogsForExport(
    {
      ...query,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    },
    AUDIT_EXPORT_MAX_ROWS,
  );

  const csv = toCsv(
    EXPORT_HEADER,
    items.map((row) => [
      row.createdAt.toISOString(),
      row.actor?.id ?? row.actorId,
      row.actor?.email,
      row.action,
      row.targetType,
      row.targetId,
      row.metadata === null ? null : JSON.stringify(row.metadata),
    ]),
  );

  return { csv, total, truncated: total > items.length };
}
