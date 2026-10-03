import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createTestContext, type TestContext } from './helpers.js';

interface Operation {
  tags?: string[];
  summary?: string;
  security?: Record<string, unknown>[];
  responses?: Record<string, unknown>;
}

interface OpenApiDoc {
  tags: { name: string }[];
  paths: Record<string, Record<string, Operation>>;
}

/** Todas as rotas entregues na Fase 0 e na Fase 1 (1.1–1.5). Rota nova da fase entra aqui. */
const PHASE_ROUTES = [
  'GET /health',
  'GET /health/db',
  'POST /auth',
  'POST /auth/login',
  'POST /auth/google',
  'POST /auth/apple',
  'POST /auth/refresh',
  'POST /auth/logout',
  'GET /auth/me',
  'POST /media',
  'GET /media/{id}',
  'GET /profile',
  'PATCH /profile',
  'POST /profile/avatar',
  'GET /profile/measurements',
  'POST /profile/measurements',
  'GET /exercises',
  'POST /exercises/custom',
  'PATCH /exercises/custom/{id}',
  'DELETE /exercises/custom/{id}',
  'GET /workout-sheets',
  'POST /workout-sheets',
  'GET /workout-sheets/{id}',
  'PATCH /workout-sheets/{id}',
  'DELETE /workout-sheets/{id}',
  'PATCH /workout-sheets/{id}/reorder',
  'GET /workout-sessions',
  'POST /workout-sessions',
  'GET /workout-sessions/{id}',
  'PATCH /workout-sessions/{id}',
  'POST /workout-sessions/{id}/complete',
  'POST /workout-sessions/{id}/photo',
];

/** Unicas rotas sem bearer: health, e as que emitem/renovam tokens. */
const PUBLIC_ROUTES = new Set([
  'GET /health',
  'GET /health/db',
  'POST /auth',
  'POST /auth/login',
  'POST /auth/google',
  'POST /auth/apple',
  'POST /auth/refresh',
]);

let ctx: TestContext;
let doc: OpenApiDoc;
let operations: Map<string, Operation>;

before(async () => {
  ctx = await createTestContext();
  doc = (await ctx.app.inject({ method: 'GET', url: '/docs/json' })).json<OpenApiDoc>();
  operations = new Map(
    Object.entries(doc.paths).flatMap(([path, ops]) =>
      Object.entries(ops).map(([method, op]) => [`${method.toUpperCase()} ${path}`, op] as const),
    ),
  );
});

after(async () => {
  await ctx.close();
});

describe('Swagger (/docs/json)', () => {
  it('documenta todas as rotas da fase', () => {
    const missing = PHASE_ROUTES.filter((route) => !operations.has(route));

    assert.deepEqual(missing, []);
  });

  it('nao expoe rota fora da lista da fase (lista acima precisa acompanhar o codigo)', () => {
    const unexpected = [...operations.keys()].filter((route) => !PHASE_ROUTES.includes(route));

    assert.deepEqual(unexpected, []);
  });

  it('toda operacao tem summary e exatamente uma tag declarada', () => {
    const declared = new Set(doc.tags.map((tag) => tag.name));
    const problems = [...operations].flatMap(([route, op]) => {
      const issues: string[] = [];

      if (!op.summary) issues.push(`${route}: sem summary`);
      if (op.tags?.length !== 1) issues.push(`${route}: tags=${JSON.stringify(op.tags)}`);
      else if (!declared.has(op.tags[0]!))
        issues.push(`${route}: tag '${op.tags[0]!}' nao declarada`);

      return issues;
    });

    assert.deepEqual(problems, []);
  });

  it('rotas protegidas declaram bearerAuth e documentam 401; publicas nao declaram security', () => {
    const problems = [...operations].flatMap(([route, op]) => {
      const hasBearer = op.security?.some((entry) => 'bearerAuth' in entry) ?? false;

      if (PUBLIC_ROUTES.has(route)) {
        return hasBearer ? [`${route}: publica mas declara bearerAuth`] : [];
      }

      return [
        ...(hasBearer ? [] : [`${route}: sem bearerAuth`]),
        ...(op.responses?.['401'] ? [] : [`${route}: sem resposta 401 documentada`]),
      ];
    });

    assert.deepEqual(problems, []);
  });

  it('toda operacao documenta ao menos uma resposta de sucesso', () => {
    const missing = [...operations]
      .filter(([, op]) => !Object.keys(op.responses ?? {}).some((code) => code.startsWith('2')))
      // GET /media/{id} omite o schema de 200 de proposito (binario cru — ver media.routes.ts)
      .filter(([route]) => route !== 'GET /media/{id}')
      .map(([route]) => route);

    assert.deepEqual(missing, []);
  });
});
