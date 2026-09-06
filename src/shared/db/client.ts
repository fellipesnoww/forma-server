import { PrismaPg } from '@prisma/adapter-pg';

import { env } from '../../config/env.js';
import { PrismaClient } from '../../generated/prisma/client.js';

/**
 * Cliente Prisma unico do processo.
 *
 * Repositories importam este singleton diretamente (evita arrastar a instancia do Fastify
 * ate a camada de dados). Rotas e handlers podem usar `app.prisma`, decorado por
 * `plugins/prisma.ts` — e o mesmo objeto, o plugin so adiciona ciclo de vida.
 *
 * Nao ha guard `globalThis` estilo Next.js: `tsx watch` reinicia o processo inteiro,
 * nao faz hot reload de modulo, entao nao existe risco de acumular conexoes.
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({ adapter });

export type Prisma = typeof prisma;
