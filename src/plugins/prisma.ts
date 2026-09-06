import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { prisma } from '../shared/db/client.js';

/**
 * Liga o ciclo de vida do Prisma ao do Fastify:
 * conecta no boot (fail-fast: sobe sem banco = erro na inicializacao, nao no primeiro request)
 * e desconecta no `app.close()`, junto com o graceful shutdown do server.ts.
 */
async function prismaPlugin(app: FastifyInstance): Promise<void> {
  await prisma.$connect();

  app.decorate('prisma', prisma);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
}

export default fp(prismaPlugin, { name: 'prisma' });
