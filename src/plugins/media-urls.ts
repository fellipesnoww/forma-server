import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { isS3MediaRef, type MediaUrlSigner } from '../shared/media/index.js';

/**
 * Campos de resposta que carregam midia. So eles sao olhados: um texto livre do usuario
 * (comentario, nome) que por acaso comece com `s3:` nunca vira URL assinada.
 */
const MEDIA_URL_FIELDS = new Set([
  'url',
  'avatarUrl',
  'photoUrl',
  'photoUrls',
  'mediaUrl',
  'femaleMediaUrl',
  'iconUrl',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const proto = Object.getPrototypeOf(value) as unknown;

  return proto === Object.prototype || proto === null;
}

/**
 * Copia o payload trocando cada referencia `s3:<chave>` (em campos de midia) pela URL
 * pre-assinada. Copia em vez de mutar: o objeto pode ter vindo de um cache ou constante.
 */
async function signPayload(
  value: unknown,
  signer: MediaUrlSigner,
  field?: string,
): Promise<unknown> {
  if (typeof value === 'string') {
    return field && MEDIA_URL_FIELDS.has(field) && isS3MediaRef(value) ? signer.sign(value) : value;
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => signPayload(item, signer, field)));
  }

  if (isPlainObject(value)) {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, item]) => [key, await signPayload(item, signer, key)]),
    );

    return Object.fromEntries(entries) as Record<string, unknown>;
  }

  return value;
}

/**
 * Bucket privado: o banco guarda `s3:<chave>` e cada resposta JSON sai com URLs de GET
 * pre-assinadas (validade `MEDIA_URL_TTL_SECONDS`). Fica num hook global, antes da
 * serializacao, para que nenhuma rota — atual ou futura — vaze a referencia crua ou precise
 * lembrar de assinar. Sem `signer` (driver database) o plugin nao registra nada.
 */
async function mediaUrlsPlugin(
  app: FastifyInstance,
  options: { signer: MediaUrlSigner | null },
): Promise<void> {
  const { signer } = options;

  if (!signer) {
    return;
  }

  app.addHook('preSerialization', async (_request, _reply, payload) =>
    signPayload(payload, signer),
  );
}

export default fp(mediaUrlsPlugin, { name: 'media-urls' });
