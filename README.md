# forma-server

Backend do **Forma** — plataforma mobile e web para gerenciamento de treinos e atividades físicas, com perfis hierárquicos, gamificação e acompanhamento de evolução física.

> **Missão:** ajudar qualquer pessoa a treinar com mais consistência, clareza e motivação — independentemente de ter ou não um personal trainer.

## Sobre o produto

O Forma resolve a dispersão de dados de quem treina: cadernos, planilhas e apps em inglês que não se conversam. Reúne em um só lugar musculação, atividades livres (natação, futebol, corrida), medidas corporais e progressão visual — tudo em português.

**Diferenciais:**

| Diferencial             | Detalhe                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| Tudo em um lugar        | Musculação, atividades livres, medidas corporais e progressão     |
| Registro retroativo     | Calendário permite lançar treinos e atividades de dias anteriores |
| Acompanhamento corporal | Peso, altura, cintura e peitoral com histórico e evolução         |
| Gamificação real        | Conquistas e desafios criados por admins                          |
| Português nativo        | Interface 100% em pt-BR                                           |
| Login sem atrito        | Autenticação via Google e Apple — zero cadastro manual            |
| Gestão escalável        | Hierarquia de usuários: super user → admin → usuário              |

**Escopo do backend (MVP):** autenticação OAuth e sistema de roles, perfil e medidas corporais, biblioteca de exercícios e exercícios personalizados, planilhas de treino, execução e registro de sessões, atividades livres, calendário com datas retroativas, dados de progressão, conquistas e desafios, e painel administrativo.

Detalhes completos em [escopo-negocio.md](escopo-negocio.md) e [roadmap-features.md](roadmap-features.md).

## Stack

Node.js 24 (LTS) · TypeScript · Fastify 5 · PostgreSQL 17 (Docker) · OpenAPI 3.1 via `@fastify/swagger`.

Escolhas de arquitetura relevantes para o produto:

- **Roles hierárquicas** modeladas desde o início — o escopo trata falha de permissão como risco técnico grave.
- **Timestamps arbitrários** nas sessões, para suportar registro retroativo já no MVP.
- **Validação de ambiente com fail-fast** (zod): o servidor não sobe com configuração inválida.

## Pré-requisitos

- [nvm](https://github.com/nvm-sh/nvm) (ou Node 24+)
- Yarn 1.22+ (`npm i -g yarn`)
- Docker + Docker Compose

> O gerenciador de pacotes do projeto é o **yarn** — o `yarn.lock` é versionado e `package-lock.json` está no `.gitignore`. Não misture com `npm install`.

## Como rodar

```bash
nvm use                # usa a versão do .nvmrc (Node 24)
yarn install
cp .env.example .env   # ajuste os valores se necessário
yarn db:up             # sobe o PostgreSQL em container
yarn dev               # servidor em http://localhost:3333
```

Verificar se está no ar:

```bash
curl http://localhost:3333/health
# {"status":"ok","uptime":0.61,"timestamp":"..."}
```

## Documentação da API (Swagger)

Com o servidor rodando:

| Endereço                        | Conteúdo                      |
| ------------------------------- | ----------------------------- |
| http://localhost:3333/docs      | Swagger UI interativo         |
| http://localhost:3333/docs/json | Documento OpenAPI 3.1 em JSON |
| http://localhost:3333/docs/yaml | Documento OpenAPI 3.1 em YAML |

A documentação é gerada automaticamente a partir do `schema` declarado em cada rota — não há arquivo OpenAPI mantido à mão. **Os schemas são escritos em Zod**, não em JSON Schema cru: `fastify-type-provider-zod` faz a conversão e ainda dá inferência de tipos no handler (`request.body` já vem tipado).

Tipe o arquivo de rotas como `FastifyPluginAsyncZod` e passe os objetos Zod direto, como em [src/features/health/health.routes.ts](src/features/health/health.routes.ts):

```ts
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '',
    {
      schema: {
        tags: ['Health'],
        summary: 'Verifica a disponibilidade do servico',
        response: { 200: healthResponseSchema }, // objeto Zod
      },
    },
    async () => ({
      status: 'ok' as const,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
  );
};
```

> Com o `serializerCompiler` do Zod ativo, **qualquer schema não-Zod em `response` lança `InvalidSchemaError`**. Use path `''` (e não `'/'`) para a rota raiz da feature: com `'/'` o Fastify registra `/health/` e é essa a forma que aparece no OpenAPI.

Rotas autenticadas devem referenciar o security scheme `bearerAuth`, já declarado em [src/plugins/swagger.ts](src/plugins/swagger.ts):

```ts
schema: { security: [{ bearerAuth: [] }], /* ... */ }
```

Novas áreas da API devem registrar sua tag na lista `tags` do mesmo arquivo (ex.: `Auth`, `Treinos`, `Atividades`, `Admin`).

**Exposição:** o Swagger fica habilitado por padrão fora de produção. Em `NODE_ENV=production` ele é desligado, a menos que `ENABLE_SWAGGER=true` seja definido explicitamente.

## Scripts

| Script              | Descrição                                                 |
| ------------------- | --------------------------------------------------------- |
| `yarn dev`          | Servidor em modo watch (tsx)                              |
| `yarn build`        | Limpa `dist/`, gera o client Prisma e compila TypeScript  |
| `yarn start`        | Executa a build de `dist/`                                |
| `yarn typecheck`    | `tsc --noEmit` (código e `test/`)                         |
| `yarn test`         | Testes de integração (`node:test`); exige Postgres + seed |
| `yarn lint`         | ESLint (regras Airbnb)                                    |
| `yarn lint:fix`     | ESLint com correção automática                            |
| `yarn format`       | Formata o projeto com Prettier                            |
| `yarn format:check` | Verifica formatação sem alterar arquivos                  |
| `yarn db:up`        | Sobe o container do PostgreSQL                            |
| `yarn db:down`      | Derruba o container (o volume de dados persiste)          |
| `yarn db:generate`  | Gera o Prisma Client em `src/generated/prisma`            |
| `yarn db:migrate`   | Cria e aplica migration em desenvolvimento                |
| `yarn db:deploy`    | Aplica migrations pendentes (produção)                    |
| `yarn db:seed`      | Executa os seeds de `src/db/seed/`                        |
| `yarn db:studio`    | Abre o Prisma Studio                                      |
| `yarn db:reset`     | **Apaga o banco**, reaplica migrations e roda os seeds    |
| `yarn token:dev`    | Emite um JWT para testar rotas autenticadas (só em dev)   |

## Estrutura

O código de domínio é organizado **por feature** (vertical slice), não por camada técnica.

```
prisma/            # schema.prisma + migrations versionadas
src/
  server.ts        # bootstrap: listen + graceful shutdown
  app.ts           # buildApp(): plugins globais + registro das features
  config/env.ts    # carrega e valida variáveis de ambiente (zod, fail-fast)
  generated/       # Prisma Client (gitignored, recriado por yarn db:generate)
  types/           # module augmentation do Fastify (prisma, authenticate, user)
  plugins/         # infra Fastify transversal
    swagger.ts error-handler.ts prisma.ts auth.ts rate-limit.ts
  shared/          # código usado por várias features
    errors/ db/ auth/ media/
  features/        # uma pasta por bounded context
    health/ auth/ media/ profile/ exercises/ workout-sheets/ workout-sessions/ activities/ calendar/ progress/
  db/seed/         # seeds da aplicação
  dev/             # ferramentas de desenvolvimento (mint-token)
test/              # testes de integração (node:test + app.inject contra o Postgres do .env)
```

`app.ts` é separado de `server.ts` para permitir testes que importem `buildApp()` sem abrir porta.

### Template de feature

Cada feature expõe **apenas** seu `index.ts`; nenhuma outra parte do código importa seus arquivos internos.

```
src/features/<nome>/
  index.ts              # register<Nome>Routes(app): Promise<void>
  <nome>.routes.ts      # rotas Fastify + schemas Zod
  <nome>.service.ts     # regras de negócio
  <nome>.repository.ts  # acesso a dados (Prisma)
  <nome>.schemas.ts     # Zod: body, params, query, response
```

```ts
// index.ts
export async function registerMediaRoutes(app: FastifyInstance): Promise<void> {
  await app.register(mediaRoutes, { prefix: '/media' });
}
```

| Regra                      | Diretriz                                                        |
| -------------------------- | --------------------------------------------------------------- |
| Colocation                 | Tudo da feature vive em `features/<nome>/`                      |
| Export público             | Outras features importam só de `features/<nome>/index.ts`       |
| Sem import interno cruzado | Uma feature nunca importa o `.service.ts` de outra diretamente  |
| Registro no `app.ts`       | Só via `register<Nome>Routes(app)`                              |
| `shared/` mínimo           | Só o genuinamente transversal (cliente DB, erros, mídia, roles) |
| `plugins/`                 | Hooks e decorators do Fastify — nunca lógica de domínio         |

Ao concluir uma etapa, registre a implementação em [`sdd/`](sdd/).

### Erros

Toda resposta de erro usa o mesmo envelope, produzido por [src/plugins/error-handler.ts](src/plugins/error-handler.ts):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
```

| `code`                   | HTTP | Quando                                            |
| ------------------------ | ---- | ------------------------------------------------- |
| `VALIDATION_ERROR`       | 400  | Body/params/query fora do schema Zod              |
| `UNAUTHORIZED`           | 401  | Token ausente, inválido ou que não é de acesso    |
| `FORBIDDEN`              | 403  | Papel insuficiente (`requireRole`)                |
| `NOT_FOUND`              | 404  | Rota ou recurso inexistente                       |
| `CONFLICT`               | 409  | Violação de unicidade ou de chave estrangeira     |
| `PAYLOAD_TOO_LARGE`      | 413  | Corpo ou arquivo acima do limite                  |
| `UNSUPPORTED_MEDIA_TYPE` | 415  | MIME não permitido ou divergente do conteúdo real |
| `RATE_LIMITED`           | 429  | Limite de requisições excedido                    |
| `INTERNAL_ERROR`         | 500  | Exceção não mapeada                               |

Em `NODE_ENV=production`, respostas 5xx não expõem `message` original nem `details` — o detalhe fica só no log. Para lançar um erro de domínio, use `AppError` de [src/shared/errors](src/shared/errors/app-error.ts):

```ts
throw AppError.notFound('Arquivo nao encontrado');
```

## Variáveis de ambiente

Definidas em `.env` (não versionado) — use `.env.example` como referência. A aplicação **não sobe** se alguma variável obrigatória estiver ausente ou inválida.

| Variável                                                                | Descrição                                                         |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `NODE_ENV`                                                              | `development` \| `test` \| `production`                           |
| `PORT` / `HOST`                                                         | Endereço de escuta do servidor                                    |
| `LOG_LEVEL`                                                             | Nível do logger (pino)                                            |
| `ENABLE_SWAGGER`                                                        | `true` \| `false` — expõe `/docs`                                 |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | Usadas pelo `docker-compose.yml`                                  |
| `DATABASE_URL`                                                          | String de conexão usada pela aplicação                            |
| `DB_HEALTH_DEGRADED_MS`                                                 | Acima disso `/health/db` reporta `degraded`                       |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`                              | Segredos JWT — mínimo 32 caracteres                               |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL`                                    | Validade dos tokens (`15m`, `30d`)                                |
| `MEDIA_MAX_SIZE_MB`                                                     | Limite do arquivo **decodificado**                                |
| `MEDIA_ALLOWED_MIME_TYPES`                                              | Whitelist de MIME (CSV)                                           |
| `MEDIA_PUBLIC_BASE_URL`                                                 | Prefixo das URLs de mídia (vazio = relativo)                      |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW`                                  | Limite global de requisições                                      |
| `RATE_LIMIT_UPLOAD_MAX`                                                 | Limite estrito para upload e auth                                 |
| `RETROACTIVE_MAX_DAYS`                                                  | Limite de dias no passado para `performedAt` (vazio = sem limite) |
| `CALENDAR_MAX_THUMBNAILS`                                               | Miniaturas por dia em `GET /calendar` (default 3)                 |

## Banco de dados

O `docker-compose.yml` sobe um PostgreSQL 17 com healthcheck e volume nomeado (`forma-pgdata`) — os dados sobrevivem a `yarn db:down`.

```bash
yarn db:up
docker compose ps      # postgres deve aparecer como "healthy"
```

A camada de acesso a dados é o **Prisma 7**, com o driver adapter `@prisma/adapter-pg`. O schema fica em [prisma/schema.prisma](prisma/schema.prisma) e as migrations em `prisma/migrations/`.

```bash
yarn db:up          # sobe o Postgres
yarn db:migrate     # cria e aplica a migration a partir do schema
yarn db:seed        # popula dados iniciais (idempotente)
yarn db:studio      # inspeciona os dados no navegador
```

Pontos específicos do Prisma 7 neste projeto:

- A connection string **não** fica no `datasource` do schema — vem do adapter configurado em [prisma.config.ts](prisma.config.ts), que também aponta o comando de seed.
- O client é gerado em `src/generated/prisma` (gitignored). `yarn build` roda `prisma generate` antes do `tsc`; após alterar o schema, rode `yarn db:generate`.
- O cliente compartilhado vive em [src/shared/db/client.ts](src/shared/db/client.ts). Repositories importam esse singleton; rotas podem usar `app.prisma`, decorado por [src/plugins/prisma.ts](src/plugins/prisma.ts) — é o mesmo objeto, o plugin só liga o ciclo de vida (connect no boot, disconnect no shutdown).

`GET /health/db` faz um ping real no banco e reporta a latência.

## Qualidade de código

- **Lint:** ESLint 9 (flat config) com regras Airbnb via `eslint-config-airbnb-extended`, mais `eslint-config-prettier` para evitar conflitos de formatação.
- **Formatação:** Prettier (`.prettierrc`).
- **Commits:** prefixos obrigatórios (`[FEAT] `, `[FIX] `, `[DOCS] `, `[TEST] `, `[CHORE] `, `[BUILD] `) validados por commitlint + husky — ver [COMMIT_CONVENTION.md](COMMIT_CONVENTION.md).
