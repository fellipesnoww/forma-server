import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

import { env } from './config/env.js';
import { registerActivitiesRoutes } from './features/activities/index.js';
import { registerAuthRoutes } from './features/auth/index.js';
import { registerCalendarRoutes } from './features/calendar/index.js';
import { registerExercisesRoutes } from './features/exercises/index.js';
import { registerHealthRoutes } from './features/health/index.js';
import { registerMediaRoutes } from './features/media/index.js';
import { registerProfileRoutes } from './features/profile/index.js';
import { registerProgressRoutes } from './features/progress/index.js';
import { registerWorkoutSessionsRoutes } from './features/workout-sessions/index.js';
import { registerWorkoutSheetsRoutes } from './features/workout-sheets/index.js';
import authPlugin from './plugins/auth.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import prismaPlugin from './plugins/prisma.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import { registerSwagger } from './plugins/swagger.js';

/**
 * A ordem de registro importa e cada linha depende da anterior:
 * compilers antes de qualquer rota, decorators (`prisma`, `authenticate`) antes das
 * features que os usam em `onRequest`, e swagger/rate-limit antes das rotas para que
 * consigam enxerga-las.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z' } } }
        : {}),
    },
  });

  // Faz o Fastify validar e serializar a partir dos schemas Zod das features
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet, {
    // A UI do Swagger usa scripts e estilos inline; sem isso a CSP padrao bloqueia /docs
    contentSecurityPolicy: env.ENABLE_SWAGGER
      ? {
          directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'", "'unsafe-inline'"],
            'style-src': ["'self'", "'unsafe-inline'"],
            'img-src': ["'self'", 'data:', 'validator.swagger.io'],
          },
        }
      : undefined,
  });
  // @fastify/cors defaults to GET,HEAD,POST — browsers need PATCH/DELETE preflights allowed too.
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(errorHandlerPlugin);
  await app.register(prismaPlugin);
  await app.register(authPlugin);
  await app.register(rateLimitPlugin);

  if (env.ENABLE_SWAGGER) {
    await registerSwagger(app);
  }

  // Features expoem apenas register<Nome>Routes; nunca importar seus arquivos internos aqui
  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerMediaRoutes(app);
  await registerProfileRoutes(app);
  await registerExercisesRoutes(app);
  await registerWorkoutSheetsRoutes(app);
  await registerWorkoutSessionsRoutes(app);
  await registerActivitiesRoutes(app);
  await registerCalendarRoutes(app);
  await registerProgressRoutes(app);

  return app;
}
