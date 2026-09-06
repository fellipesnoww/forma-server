import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { env } from '../config/env.js';

/**
 * Registra a geracao do documento OpenAPI (/docs/json) e a UI interativa (/docs).
 * Deve ser registrado antes das rotas para que os schemas sejam coletados.
 */
export async function registerSwagger(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Forma API',
        description:
          'API do Forma — plataforma de gerenciamento de treinos e atividades fisicas. ' +
          'Cobre autenticacao, perfil e medidas corporais, planilhas de treino, atividades livres, ' +
          'calendario com registro retroativo, progressao, gamificacao e painel administrativo.',
        version: '0.1.0',
      },
      servers: [{ url: `http://localhost:${env.PORT}`, description: 'Ambiente local' }],
      tags: [{ name: 'Health', description: 'Disponibilidade e monitoramento do servico' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Token emitido apos o login via Google ou Apple',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
    },
  });
}
