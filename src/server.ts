import { buildApp } from './app.js';
import { env } from './config/env.js';

async function bootstrap(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`${signal} recebido, encerrando servidor...`);
    await app.close();
  };

  (['SIGINT', 'SIGTERM'] as const).forEach((signal) => {
    process.on(signal, () => {
      shutdown(signal).catch((error: unknown) => {
        app.log.error(error, 'Falha ao encerrar o servidor');
        process.exitCode = 1;
      });
    });
  });

  await app.listen({ port: env.PORT, host: env.HOST });
}

bootstrap().catch((error: unknown) => {
  console.error('Falha ao iniciar o servidor:', error);
  process.exitCode = 1;
});
