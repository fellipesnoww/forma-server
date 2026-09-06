/**
 * Emite um access token assinado para testar rotas autenticadas.
 *
 * A Fase 0 nao tem rotas /auth (chegam na 1.1), entao este script e a unica forma de
 * exercitar `authenticate` e `requireRole` manualmente. Ferramenta de desenvolvimento:
 * nunca deve ser exposta como rota nem executada em producao.
 *
 *   yarn token:dev                                  # role=user, sub aleatorio
 *   yarn token:dev --role=admin
 *   yarn token:dev --role=user --sub=<uuid>
 *
 * Assina reutilizando `plugins/auth.ts` numa instancia Fastify descartavel, para garantir
 * que segredo e opcoes de assinatura sao exatamente os que o servidor usa na verificacao.
 */
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';

import { env } from '../config/env.js';
import authPlugin from '../plugins/auth.js';
import { isRole, type Role } from '../shared/auth/index.js';

function readFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));

  return match?.slice(prefix.length);
}

async function main(): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('mint-token e uma ferramenta de desenvolvimento e nao roda em producao');
  }

  const rawRole = readFlag('role') ?? 'user';

  if (!isRole(rawRole)) {
    throw new Error(`Papel invalido: '${rawRole}'. Use user, admin ou super_user.`);
  }

  const role: Role = rawRole;
  const sub = readFlag('sub') ?? randomUUID();

  const app = Fastify({ logger: false });
  await app.register(authPlugin);
  await app.ready();

  const token = app.jwt.sign({ sub, role, typ: 'access' });

  await app.close();

  // stdout limpo: permite `TOKEN=$(yarn --silent token:dev)`. Metadados vao para stderr.
  process.stderr.write(`sub=${sub} role=${role} ttl=${env.JWT_ACCESS_TTL}\n`);
  process.stdout.write(`${token}\n`);
}

await main();
