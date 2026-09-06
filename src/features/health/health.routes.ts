import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { env } from '../../config/env.js';
import { dbHealthResponseSchema, healthResponseSchema } from './health.schemas.js';

// Path vazio (e nao '/') combinado com o prefixo da feature registra exatamente `/health`.
// Com '/', o Fastify registraria `/health/` e era essa a forma que aparecia no OpenAPI.
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '',
    {
      // Monitoramento nao pode ser barrado pelo limite global.
      config: { rateLimit: false },
      schema: {
        tags: ['Health'],
        summary: 'Verifica a disponibilidade do servico',
        description: 'Retorna o status do servidor e ha quanto tempo esta no ar.',
        response: { 200: healthResponseSchema },
      },
    },
    async () => ({
      status: 'ok' as const,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
  );

  app.get(
    '/db',
    {
      config: { rateLimit: false },
      schema: {
        tags: ['Health'],
        summary: 'Verifica a conectividade com o Postgres',
        description:
          'Executa um ping no banco e reporta a latencia. Responde 200 com status "degraded" ' +
          `quando a latencia passa de ${String(env.DB_HEALTH_DEGRADED_MS)} ms e 503 quando o banco esta inacessivel.`,
        response: { 200: dbHealthResponseSchema, 503: dbHealthResponseSchema },
      },
    },
    async (request, reply) => {
      const startedAt = process.hrtime.bigint();

      try {
        await app.prisma.$queryRaw`SELECT 1`;
      } catch (error) {
        // A mensagem do driver traz host, usuario e as vezes a senha: fica so no log.
        request.log.error({ err: error }, 'Falha no health check do banco');

        return reply.status(503).send({
          status: 'error' as const,
          db: { status: 'down' as const, latencyMs: null },
          timestamp: new Date().toISOString(),
        });
      }

      const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

      // Latencia alta responde 200 de proposito: o servico esta de pe e nao deve ser
      // retirado do load balancer so por lentidao momentanea do banco.
      return reply.status(200).send({
        status: latencyMs > env.DB_HEALTH_DEGRADED_MS ? ('degraded' as const) : ('ok' as const),
        db: { status: 'up' as const, latencyMs },
        timestamp: new Date().toISOString(),
      });
    },
  );
};
