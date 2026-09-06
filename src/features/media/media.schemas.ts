import { z } from 'zod';

import { env } from '../../config/env.js';

export const uploadMediaBodySchema = z.object({
  // Sem `.max()` de proposito: o limite de tamanho e aplicado por `decodeBase64Media`, que
  // tambem so faz aritmetica sobre o comprimento (nao aloca buffer) mas responde 413 em vez
  // do 400 generico de validacao. O teto de memoria ja e garantido pelo `bodyLimit` da rota.
  data: z.string().min(1).describe('Conteudo do arquivo em base64, com ou sem prefixo data URL'),
  mimeType: z
    .string()
    .min(1)
    .describe(`Tipo do arquivo. Permitidos: ${env.MEDIA_ALLOWED_MIME_TYPES.join(', ')}`),
  filename: z.string().max(255).optional(),
});

export const mediaIdParamsSchema = z.object({
  id: z.uuid(),
});

export const storedMediaSchema = z.object({
  id: z.uuid(),
  url: z.string().describe('Valor a persistir em avatar_url / photo_url / media_url'),
  mimeType: z.string(),
  sizeBytes: z.int().describe('Tamanho do arquivo decodificado'),
  filename: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type UploadMediaBody = z.infer<typeof uploadMediaBodySchema>;
export type MediaIdParams = z.infer<typeof mediaIdParamsSchema>;
