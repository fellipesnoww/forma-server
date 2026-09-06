import { env } from '../../config/env.js';
import { prisma } from '../db/client.js';
import { decodeBase64Media } from './media.validation.js';
import type { MediaService, MediaUploadInput, StoredMedia } from './media.types.js';

/** Campos de metadado. Serve para manter o `bytea` fora dos SELECTs de listagem/metadado. */
const METADATA_SELECT = {
  id: true,
  mimeType: true,
  sizeBytes: true,
  filename: true,
  createdAt: true,
} as const;

interface MediaMetadataRow {
  id: string;
  mimeType: string;
  sizeBytes: number;
  filename: string | null;
  createdAt: Date;
}

/**
 * A URL e montada aqui, nunca por quem chama. E o que permite trocar o backend por S3/CDN
 * apenas mudando `MEDIA_PUBLIC_BASE_URL`, sem tocar nas features que persistem `photo_url`.
 */
function buildUrl(id: string): string {
  return `${env.MEDIA_PUBLIC_BASE_URL}/media/${id}`;
}

function toStoredMedia(row: MediaMetadataRow): StoredMedia {
  return {
    id: row.id,
    url: buildUrl(row.id),
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    filename: row.filename,
    createdAt: row.createdAt,
  };
}

/**
 * Implementacao da Fase 0: o binario mora no proprio Postgres, em `media_assets.data`
 * (`bytea`). Suficiente para o MVP e sem dependencia de infra externa.
 *
 * Substituir por um `S3MediaStorage` nao exige mudanca em nenhum consumidor — o contrato
 * `MediaService` foi desenhado para isso.
 */
export const dbMediaStorage: MediaService = {
  async upload(input: MediaUploadInput): Promise<StoredMedia> {
    const decoded = decodeBase64Media(input.data, input.declaredMimeType);

    const created = await prisma.mediaAsset.create({
      data: {
        ownerId: input.ownerId,
        mimeType: decoded.mimeType,
        sizeBytes: decoded.sizeBytes,
        filename: input.filename ?? null,
        // O Prisma tipa `Bytes` como Uint8Array<ArrayBuffer>; Buffer e Uint8Array<ArrayBufferLike>
        data: new Uint8Array(decoded.buffer),
      },
      select: METADATA_SELECT,
    });

    return toStoredMedia(created);
  },

  async getMetadata(id: string): Promise<StoredMedia | null> {
    const found = await prisma.mediaAsset.findUnique({ where: { id }, select: METADATA_SELECT });

    return found ? toStoredMedia(found) : null;
  },

  async getBinary(id: string): Promise<{ metadata: StoredMedia; buffer: Buffer } | null> {
    const found = await prisma.mediaAsset.findUnique({
      where: { id },
      select: { ...METADATA_SELECT, data: true, ownerId: true },
    });

    if (!found) {
      return null;
    }

    // O Prisma devolve `Bytes` como Uint8Array. Enviar o Uint8Array direto faria o Fastify
    // serializar um JSON de indices; esta view sobre o mesmo ArrayBuffer nao copia dados.
    const buffer = Buffer.from(found.data.buffer, found.data.byteOffset, found.data.byteLength);

    return { metadata: toStoredMedia(found), buffer };
  },

  async delete(id: string): Promise<void> {
    await prisma.mediaAsset.delete({ where: { id } });
  },
};

/** Dono do asset, usado para autorizacao. Separado para nao trazer o `bytea` junto. */
export async function findMediaOwner(id: string): Promise<{ ownerId: string | null } | null> {
  return prisma.mediaAsset.findUnique({ where: { id }, select: { ownerId: true } });
}
