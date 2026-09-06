import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

import { env } from './config/env.js';
import { registerSwagger } from './plugins/swagger.js';
import { healthRoutes } from './routes/health.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z' } } }
        : {}),
    },
  });

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
  await app.register(cors, { origin: true });

  if (env.ENABLE_SWAGGER) {
    await registerSwagger(app);
  }

  await app.register(healthRoutes);

  return app;
}
