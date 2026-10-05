import { env } from '../../config/env.js';
import { prisma } from '../db/client.js';
import type { StoredMedia } from './media.types.js';

/** Campos de metadado. Mantem o `bytea` legado fora dos SELECTs de listagem/metadado. */
export const METADATA_SELECT = {
  id: true,
  mimeType: true,
  sizeBytes: true,
  filename: true,
  storageKey: true,
  createdAt: true,
} as const;

export interface MediaMetadataRow {
  id: string;
  mimeType: string;
  sizeBytes: number;
  filename: string | null;
  storageKey: string | null;
  createdAt: Date;
}

/** Extensao do objeto no bucket, a partir do MIME detectado (nunca do declarado). */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function extensionFor(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? 'bin';
}

/**
 * Prefixo da referencia persistida para objetos do bucket: `s3:<chave>`. Nao e uma URL — o
 * bucket e privado. O plugin `media-urls` troca a referencia por uma URL pre-assinada de GET
 * ao serializar cada resposta, entao nenhuma URL com prazo de validade vai parar no banco.
 */
export const S3_MEDIA_REF_PREFIX = 's3:';

export function isS3MediaRef(value: string): boolean {
  return value.startsWith(S3_MEDIA_REF_PREFIX);
}

export function storageKeyFromRef(ref: string): string {
  return ref.slice(S3_MEDIA_REF_PREFIX.length);
}

/**
 * Valor a persistir em `avatar_url` / `photo_url` / `media_url` / `icon_url`. Montado aqui,
 * nunca por quem chama. Linhas sem `storageKey` (legado bytea / driver database) continuam
 * apontando para `GET /media/:id`.
 */
export function buildMediaUrl(row: { id: string; storageKey: string | null }): string {
  if (row.storageKey) {
    return `${S3_MEDIA_REF_PREFIX}${row.storageKey}`;
  }

  return `${env.MEDIA_PUBLIC_BASE_URL}/media/${row.id}`;
}

export function toStoredMedia(row: MediaMetadataRow): StoredMedia {
  return {
    id: row.id,
    url: buildMediaUrl(row),
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    filename: row.filename,
    createdAt: row.createdAt,
  };
}

/**
 * Dono e local do binario, usados por `GET /media/:id` para autorizar e decidir entre servir
 * o `bytea` ou redirecionar para o S3. Nao traz o binario junto.
 */
export async function findMediaOwner(
  id: string,
): Promise<{ ownerId: string | null; storageKey: string | null } | null> {
  return prisma.mediaAsset.findUnique({
    where: { id },
    select: { ownerId: true, storageKey: true },
  });
}
