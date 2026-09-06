import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { env } from '../config/env.js';
import { ERROR_CODES } from '../shared/errors/index.js';

/**
 * Configuracao reutilizavel para rotas sensiveis (upload e, a partir da Fase 1.1, /auth).
 * Aplicar em cada rota via `config: { rateLimit: STRICT_RATE_LIMIT }`.
 */
export const STRICT_RATE_LIMIT = {
  max: env.RATE_LIMIT_UPLOAD_MAX,
  timeWindow: env.RATE_LIMIT_WINDOW,
};

/**
 * Rate limiting global com store em memoria.
 *
 * Store em memoria e por instancia: com mais de um processo o limite efetivo se multiplica.
 * Trocar por Redis quando houver escala horizontal (registrado como pendencia na Fase 0).
 */
async function rateLimitPlugin(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    // O retorno daqui e tratado pelo Fastify como o *erro* da requisicao, nao como o corpo
    // da resposta: ele chega ao handler global, que monta o envelope. Por isso o objeto
    // precisa carregar `statusCode` — sem ele o handler classificaria como 500.
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      code: ERROR_CODES.RATE_LIMITED,
      message: `Limite de ${context.max} requisicoes por ${context.after} excedido`,
    }),
  });
}

export default fp(rateLimitPlugin, { name: 'rate-limit' });
