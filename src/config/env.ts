import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

/** Lista separada por virgula: 'image/png, image/jpeg' -> ['image/png', 'image/jpeg'] */
function csvList(fallback: string) {
  return z
    .string()
    .default(fallback)
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length > 0),
    )
    .pipe(z.array(z.string()).min(1));
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3333),
    HOST: z.string().min(1).default('0.0.0.0'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    DATABASE_URL: z.string().min(1),
    ENABLE_SWAGGER: booleanFromString,

    // Autenticacao (as rotas /auth chegam na Fase 1.1; a infra ja fica pronta aqui)
    JWT_ACCESS_SECRET: z.string().min(32, 'use pelo menos 32 caracteres'),
    JWT_REFRESH_SECRET: z.string().min(32, 'use pelo menos 32 caracteres'),
    JWT_ACCESS_TTL: z.string().min(1).default('15m'),
    JWT_REFRESH_TTL: z.string().min(1).default('30d'),

    // OAuth (Fase 1.1): usados como `aud` ao verificar o id/identity token do provedor
    GOOGLE_CLIENT_ID: z.string().min(1),
    APPLE_CLIENT_ID: z.string().min(1),

    // Midia: Fase 0 grava o binario no proprio Postgres (bytea), sem S3/R2
    MEDIA_MAX_SIZE_MB: z.coerce.number().positive().default(5),
    MEDIA_ALLOWED_MIME_TYPES: csvList('image/jpeg,image/png,image/webp'),
    MEDIA_PUBLIC_BASE_URL: z.string().default(''),

    // Rate limiting
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_WINDOW: z.string().min(1).default('1 minute'),
    RATE_LIMIT_UPLOAD_MAX: z.coerce.number().int().positive().default(10),

    // Acima deste tempo de resposta, GET /health/db reporta `degraded` em vez de `ok`
    DB_HEALTH_DEGRADED_MS: z.coerce.number().int().positive().default(250),
  })
  .transform((config) => {
    const maxSizeBytes = Math.floor(config.MEDIA_MAX_SIZE_MB * 1024 * 1024);

    return {
      ...config,
      // Documentacao fica exposta por padrao fora de producao
      ENABLE_SWAGGER: config.ENABLE_SWAGGER ?? config.NODE_ENV !== 'production',
      // Derivados uma unica vez: sao usados a cada upload
      MEDIA_MAX_SIZE_BYTES: maxSizeBytes,
      // Base64 cresce ~4/3 e arredonda para multiplo de 4
      MEDIA_MAX_BASE64_LENGTH: Math.ceil(maxSizeBytes / 3) * 4,
      // Limite do corpo HTTP com folga para o JSON envolvente e o prefixo data URL
      MEDIA_BODY_LIMIT: Math.ceil(maxSizeBytes / 3) * 4 + 4096,
    };
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(`Variaveis de ambiente invalidas:\n${issues}`);
}

export const env = parsed.data;

export type Env = typeof env;
