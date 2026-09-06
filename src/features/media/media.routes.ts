import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { env } from '../../config/env.js';
import { STRICT_RATE_LIMIT } from '../../plugins/rate-limit.js';
import { hasRole } from '../../shared/auth/index.js';
import { AppError } from '../../shared/errors/index.js';
import { dbMediaStorage, findMediaOwner } from '../../shared/media/index.js';
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
          `tamanho (max. ${String(env.MEDIA_MAX_SIZE_MB)} MB decodificado) e grava o binario no Postgres. ` +
          'A `url` retornada e o valor a persistir em campos como avatar_url e photo_url.',
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
      const stored = await dbMediaStorage.upload({
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
        summary: 'Baixa o binario de um arquivo',
        description:
          'Responde com o binario cru e o Content-Type detectado no upload. ' +
          'Acessivel ao dono do arquivo ou a um admin.',
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
      if (!owner || (owner.ownerId !== request.user.sub && !hasRole(request.user.role, 'admin'))) {
        throw AppError.notFound('Arquivo nao encontrado');
      }

      const found = await dbMediaStorage.getBinary(request.params.id);

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
