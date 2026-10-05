import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { env } from '../../config/env.js';
import { STRICT_RATE_LIMIT } from '../../plugins/rate-limit.js';
import { hasRole } from '../../shared/auth/index.js';
import { AppError } from '../../shared/errors/index.js';
import {
  buildMediaUrl,
  findMediaOwner,
  getDatabaseMediaBinary,
  mediaStorage,
  mediaUrlSigner,
} from '../../shared/media/index.js';
import {
  errorResponseSchema,
  mediaIdParamsSchema,
  storedMediaSchema,
  uploadMediaBodySchema,
} from './media.schemas.js';

export const mediaRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '',
    {
      onRequest: [app.authenticate],
      // O default do Fastify e 1 MB: sem este limite um base64 de 5 MB (~6,7 MB) morreria
      // com FST_ERR_CTP_BODY_TOO_LARGE antes de chegar ao handler.
      bodyLimit: env.MEDIA_BODY_LIMIT,
      config: { rateLimit: STRICT_RATE_LIMIT },
      schema: {
        tags: ['Media'],
        summary: 'Envia um arquivo em base64',
        description:
          'Recebe o arquivo em base64, valida MIME (pelo conteudo, nao pelo campo enviado) e ' +
          `tamanho (max. ${String(env.MEDIA_MAX_SIZE_MB)} MB decodificado) e grava o binario no S3 ` +
          '(bucket privado). A `url` retornada e pre-assinada: funciona direto em `<img src>`, sem ' +
          `token, por ${String(env.MEDIA_URL_TTL_SECONDS)} s. Nao a guarde — busque o recurso de novo ` +
          'para receber uma URL valida.',
        security: [{ bearerAuth: [] }],
        body: uploadMediaBodySchema,
        response: {
          201: storedMediaSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
          429: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const stored = await mediaStorage.upload({
        data: request.body.data,
        declaredMimeType: request.body.mimeType,
        filename: request.body.filename,
        ownerId: request.user.sub,
      });

      return reply.status(201).send({ ...stored, createdAt: stored.createdAt.toISOString() });
    },
  );

  app.get(
    '/:id',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Media'],
        summary: 'Baixa o binario de um arquivo (legado)',
        description:
          'Arquivos no S3 respondem 302 para uma URL pre-assinada. Arquivos legados guardados no ' +
          'Postgres (bytea) respondem com o binario cru e o Content-Type detectado no upload. ' +
          'Clientes devem usar a `url` devolvida no upload; esta rota existe para URLs antigas. ' +
          'Acessivel ao dono do arquivo ou a um admin. Midia global (sem dono — imagens do ' +
          'catalogo de exercicios e icones de conquistas, enviadas pelo painel admin) e ' +
          'acessivel a qualquer usuario autenticado.',
        security: [{ bearerAuth: [] }],
        params: mediaIdParamsSchema,
        // Sem schema de 200 de proposito: com um schema Zod o serializer converteria o
        // Buffer em JSON. Sem ele, o Fastify envia o Buffer intacto.
        response: {
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const owner = await findMediaOwner(request.params.id);

      // 404 e nao 403 quando o asset e de outro usuario: 403 confirmaria que o id existe.
      // `ownerId` null = midia global do catalogo (Fase 3.2/3.5), visivel a todos.
      const readable =
        owner !== null &&
        (owner.ownerId === null ||
          owner.ownerId === request.user.sub ||
          hasRole(request.user.role, 'admin'));

      if (!readable) {
        throw AppError.notFound('Arquivo nao encontrado');
      }

      // Binario no bucket privado: redireciona para uma URL pre-assinada de curta duracao
      if (owner.storageKey && mediaUrlSigner) {
        const ref = buildMediaUrl({ id: request.params.id, storageKey: owner.storageKey });

        return reply.redirect(await mediaUrlSigner.sign(ref), 302);
      }

      const found = await getDatabaseMediaBinary(request.params.id);

      if (!found) {
        throw AppError.notFound('Arquivo nao encontrado');
      }

      reply
        .header('content-type', found.metadata.mimeType)
        .header('content-length', found.metadata.sizeBytes)
        .header('cache-control', 'private, max-age=31536000, immutable');

      // O type provider infere o tipo de `send` a partir dos schemas de resposta
      // declarados (aqui so 401 e 404). O corpo de sucesso e binario e nao tem schema
      // de proposito — sem ele o Fastify envia o Buffer intacto, sem serializar.
      return reply.send(found.buffer as unknown as never);
    },
  );
};
