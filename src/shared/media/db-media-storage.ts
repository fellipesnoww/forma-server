import { prisma } from '../db/client.js';
import { METADATA_SELECT, toStoredMedia } from './media-assets.js';
import { decodeBase64Media } from './media.validation.js';
import type { MediaService, MediaUploadInput, StoredMedia } from './media.types.js';

/**
 * Driver `database`: o binario mora em `media_assets.data` (`bytea`) e e servido por
 * `GET /media/:id`. Era o armazenamento da Fase 0; hoje so para testes e dev sem AWS.
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

  async delete(id: string): Promise<void> {
    await prisma.mediaAsset.delete({ where: { id } });
  },
};

/**
 * Binario de um asset guardado no Postgres (driver database ou linha legada ainda nao migrada
 * para o S3). Null quando o asset nao existe ou o binario mora no bucket.
 */
export async function getDatabaseMediaBinary(
  id: string,
): Promise<{ metadata: StoredMedia; buffer: Buffer } | null> {
  const found = await prisma.mediaAsset.findUnique({
    where: { id },
    select: { ...METADATA_SELECT, data: true },
  });

  if (!found?.data) {
    return null;
  }

  // O Prisma devolve `Bytes` como Uint8Array. Enviar o Uint8Array direto faria o Fastify
  // serializar um JSON de indices; esta view sobre o mesmo ArrayBuffer nao copia dados.
  const buffer = Buffer.from(found.data.buffer, found.data.byteOffset, found.data.byteLength);

  return { metadata: toStoredMedia(found), buffer };
}
