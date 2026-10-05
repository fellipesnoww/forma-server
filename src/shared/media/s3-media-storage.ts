import { randomUUID } from 'node:crypto';

import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { env } from '../../config/env.js';
import { prisma } from '../db/client.js';
import { extensionFor, METADATA_SELECT, toStoredMedia } from './media-assets.js';
import { decodeBase64Media } from './media.validation.js';
import type { MediaService, MediaUploadInput, StoredMedia } from './media.types.js';

/** O que o driver usa do S3Client. Permite injetar um stub nos testes. */
export interface S3Sender {
  send(command: PutObjectCommand | DeleteObjectCommand): Promise<unknown>;
}

export interface S3MediaStorageOptions {
  client: S3Sender;
  bucket: string;
  keyPrefix: string;
}

/**
 * Driver `s3`: binario no bucket, metadado em `media_assets` (com `data` null).
 *
 * O bucket e privado: a leitura so acontece por URL pre-assinada (`media-url-signer.ts`). O
 * objeto e gravado com `Cache-Control` imutavel e `private` — a chave carrega um uuid novo a
 * cada upload (o conteudo nunca muda), mas so o browser de quem recebeu a URL deve guarda-lo.
 */
export function createS3MediaStorage(options: S3MediaStorageOptions): MediaService {
  const { client, bucket, keyPrefix } = options;

  return {
    async upload(input: MediaUploadInput): Promise<StoredMedia> {
      const decoded = decodeBase64Media(input.data, input.declaredMimeType);
      const id = randomUUID();
      const key = `${keyPrefix ? `${keyPrefix}/` : ''}${id}.${extensionFor(decoded.mimeType)}`;

      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: decoded.buffer,
          ContentType: decoded.mimeType,
          ContentLength: decoded.sizeBytes,
          CacheControl: 'private, max-age=31536000, immutable',
        }),
      );

      try {
        const created = await prisma.mediaAsset.create({
          data: {
            id,
            ownerId: input.ownerId,
            mimeType: decoded.mimeType,
            sizeBytes: decoded.sizeBytes,
            filename: input.filename ?? null,
            storageKey: key,
          },
          select: METADATA_SELECT,
        });

        return toStoredMedia(created);
      } catch (error) {
        // Sem a linha ninguem referencia o objeto: remove para nao deixar lixo no bucket
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});
        throw error;
      }
    },

    async getMetadata(id: string): Promise<StoredMedia | null> {
      const found = await prisma.mediaAsset.findUnique({ where: { id }, select: METADATA_SELECT });

      return found ? toStoredMedia(found) : null;
    },

    async delete(id: string): Promise<void> {
      const deleted = await prisma.mediaAsset.delete({
        where: { id },
        select: { storageKey: true },
      });

      if (deleted.storageKey) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: deleted.storageKey }));
      }
    },
  };
}

/** Client unico do processo. So e criado com o driver `s3` (env ja validou region e bucket). */
export function createDefaultS3Client(): S3Client {
  return new S3Client({
    region: env.AWS_REGION,
    ...(env.AWS_S3_ENDPOINT ? { endpoint: env.AWS_S3_ENDPOINT } : {}),
    forcePathStyle: env.AWS_S3_FORCE_PATH_STYLE,
  });
}
