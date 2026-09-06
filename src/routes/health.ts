import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Verifica a disponibilidade do servico',
        description: 'Retorna o status do servidor e ha quanto tempo esta no ar.',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', const: 'ok' },
              uptime: { type: 'number', description: 'Tempo no ar em segundos' },
              timestamp: { type: 'string', format: 'date-time' },
            },
            required: ['status', 'uptime', 'timestamp'],
          },
        },
      },
    },
    async () => ({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
  );
}
