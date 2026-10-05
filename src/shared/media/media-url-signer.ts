import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { storageKeyFromRef } from './media-assets.js';

export interface MediaUrlSigner {
  /** Troca uma referencia `s3:<chave>` por uma URL de GET pre-assinada. */
  sign(ref: string): Promise<string>;
}

export interface MediaUrlSignerOptions {
  client: S3Client;
  bucket: string;
  ttlSeconds: number;
  /** Relogio injetavel para testes. */
  now?: () => Date;
}

/**
 * Assina localmente (HMAC SigV4, sem chamada de rede) uma URL de GET valida por `ttlSeconds`.
 *
 * A data de assinatura e arredondada para janelas de `ttlSeconds / 2`: dentro da mesma janela
 * a mesma imagem gera a MESMA URL, entao o cache do browser/CDN continua funcionando entre
 * requisicoes. Toda URL entregue ainda vale pelo menos metade do TTL.
 */
export function createMediaUrlSigner(options: MediaUrlSignerOptions): MediaUrlSigner {
  const { client, bucket, ttlSeconds } = options;
  const now = options.now ?? (() => new Date());
  const windowMs = Math.floor(ttlSeconds / 2) * 1000;

  return {
    sign(ref: string): Promise<string> {
      const signingDate = new Date(Math.floor(now().getTime() / windowMs) * windowMs);

      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: storageKeyFromRef(ref) }),
        { expiresIn: ttlSeconds, signingDate },
      );
    },
  };
}
