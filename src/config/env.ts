import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3333),
    HOST: z.string().min(1).default('0.0.0.0'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    DATABASE_URL: z.string().min(1),
    ENABLE_SWAGGER: booleanFromString,
  })
  .transform((config) => ({
    ...config,
    // Documentacao fica exposta por padrao fora de producao
    ENABLE_SWAGGER: config.ENABLE_SWAGGER ?? config.NODE_ENV !== 'production',
  }));

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(`Variaveis de ambiente invalidas:\n${issues}`);
}

export const env = parsed.data;

export type Env = typeof env;
