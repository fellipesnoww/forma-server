import type { FastifyInstance } from 'fastify';

import { calendarRoutes } from './calendar.routes.js';

/**
 * Feature somente leitura: agrega sessoes (1.5) e atividades (2.1) por dia local do usuario.
 * Nao possui tabela propria.
 */
export async function registerCalendarRoutes(app: FastifyInstance): Promise<void> {
  await app.register(calendarRoutes, { prefix: '/calendar' });
}
