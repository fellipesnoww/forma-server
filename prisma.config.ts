import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { defineConfig } from 'prisma/config';

/**
 * Configuracao da CLI do Prisma (migrate, generate, studio, seed).
 *
 * No Prisma 7 a connection string saiu do `datasource` do schema: a CLI obtem a
 * conexao pelo mesmo driver adapter usado em runtime (src/shared/db/client.ts).
 * Este arquivo roda fora do `src/`, entao le `process.env` direto em vez do
 * schema Zod de `src/config/env.ts`.
 */
function requireDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL nao definida: configure o .env antes de rodar a CLI do Prisma');
  }

  return connectionString;
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // `prisma migrate dev` cria e derruba um shadow database, o que exige uma conexao
  // direta alem do adapter usado para as queries.
  datasource: {
    url: requireDatabaseUrl(),
  },
  migrations: {
    seed: 'tsx src/db/seed/index.ts',
  },
  adapter: () => Promise.resolve(new PrismaPg({ connectionString: requireDatabaseUrl() })),
});
