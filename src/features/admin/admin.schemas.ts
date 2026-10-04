import { z } from 'zod';

/**
 * Schemas comuns a todas as rotas `/admin/*`. Vivem na raiz da feature porque as subpastas
 * (`exercises/`, `users/`, ...) sao partes do mesmo bounded context, nao features distintas.
 */

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const idParamsSchema = z.object({ id: z.uuid() });

/** Convencao de paginacao admin do roadmap: `?page=&limit=` -> `{ items, total, page, limit }`. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export function paginated<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), total: z.int(), page: z.int(), limit: z.int() });
}

export const activeStatusFilterSchema = z
  .enum(['active', 'inactive', 'all'])
  .default('all')
  .describe('Filtro por isActive. Default: all (o painel ve inativos)');

/** Upload base64 embutido no corpo, mesmo formato de `POST /media`. */
export const mediaUploadSchema = z
  .object({
    data: z.string().min(1).describe('Conteudo do arquivo em base64, com ou sem prefixo data URL'),
    mimeType: z.string().min(1),
    filename: z.string().max(255).optional(),
  })
  .describe('Arquivo enviado junto com o cadastro; vira midia global (sem dono)');

/** Descricao padrao das respostas 403 nas rotas exclusivas de super_user. */
export const SUPER_USER_ONLY = 'Exclusivo de super_user (admin recebe 403).';

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type MediaUpload = z.infer<typeof mediaUploadSchema>;

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/** Quem executa a acao admin: `request.user` ja com o papel conferido no banco. */
export interface AdminActor {
  id: string;
  role: 'user' | 'admin' | 'super_user';
}

export function toActor(user: { sub: string; role: AdminActor['role'] }): AdminActor {
  return { id: user.sub, role: user.role };
}
