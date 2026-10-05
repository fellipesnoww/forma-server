import { env } from '../../config/env.js';
import { dbMediaStorage } from './db-media-storage.js';
import { createMediaUrlSigner, type MediaUrlSigner } from './media-url-signer.js';
import { createDefaultS3Client, createS3MediaStorage } from './s3-media-storage.js';
import type { MediaService } from './media.types.js';

const s3Client = env.MEDIA_STORAGE_DRIVER === 's3' ? createDefaultS3Client() : null;

/** Armazenamento usado pelas features, escolhido por `MEDIA_STORAGE_DRIVER`. */
export const mediaStorage: MediaService = s3Client
  ? createS3MediaStorage({
      client: s3Client,
      bucket: env.AWS_S3_BUCKET ?? '',
      keyPrefix: env.AWS_S3_KEY_PREFIX,
    })
  : dbMediaStorage;

/** Assinador das referencias `s3:`. Null no driver database (nao ha bucket). */
export const mediaUrlSigner: MediaUrlSigner | null = s3Client
  ? createMediaUrlSigner({
      client: s3Client,
      bucket: env.AWS_S3_BUCKET ?? '',
      ttlSeconds: env.MEDIA_URL_TTL_SECONDS,
    })
  : null;

export { dbMediaStorage, getDatabaseMediaBinary } from './db-media-storage.js';
export {
  buildMediaUrl,
  extensionFor,
  findMediaOwner,
  isS3MediaRef,
  S3_MEDIA_REF_PREFIX,
  storageKeyFromRef,
} from './media-assets.js';
export { createMediaUrlSigner } from './media-url-signer.js';
export type { MediaUrlSigner, MediaUrlSignerOptions } from './media-url-signer.js';
export { createDefaultS3Client, createS3MediaStorage } from './s3-media-storage.js';
export type { S3MediaStorageOptions, S3Sender } from './s3-media-storage.js';
export { decodeBase64Media, detectMimeType, isAllowedMimeType } from './media.validation.js';
export type { DecodedMedia } from './media.validation.js';
export type { MediaService, MediaUploadInput, StoredMedia } from './media.types.js';
