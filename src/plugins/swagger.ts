import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform, jsonSchemaTransformObject } from 'fastify-type-provider-zod';

import { env } from '../config/env.js';

/**
 * Registra a geracao do documento OpenAPI (/docs/json) e a UI interativa (/docs).
 * Deve ser registrado antes das rotas para que os schemas sejam coletados.
 *
 * `jsonSchemaTransform` converte os schemas Zod declarados nas rotas para JSON Schema —
 * e por isso que as features escrevem Zod e nunca JSON Schema cru.
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
      servers: [{ url: `http://localhost:${String(env.PORT)}`, description: 'Ambiente local' }],
      tags: [
        { name: 'Health', description: 'Disponibilidade e monitoramento do servico' },
        { name: 'Auth', description: 'Registro, login, OAuth e sessao' },
        { name: 'Media', description: 'Upload e download de arquivos' },
        { name: 'Perfil', description: 'Dados de perfil e medidas corporais' },
        { name: 'Exercicios', description: 'Catalogo de exercicios e exercicios personalizados' },
        { name: 'Planilhas', description: 'Planilhas de treino' },
        { name: 'Sessoes', description: 'Execucao e historico de sessoes de treino' },
        { name: 'Atividades', description: 'Atividades livres e tipos de atividade' },
      ],
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
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true, persistAuthorization: true },
  });
}
