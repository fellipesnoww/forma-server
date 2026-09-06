# forma-server

Backend do **Forma** — plataforma mobile e web para gerenciamento de treinos e atividades físicas, com perfis hierárquicos, gamificação e acompanhamento de evolução física.

> **Missão:** ajudar qualquer pessoa a treinar com mais consistência, clareza e motivação — independentemente de ter ou não um personal trainer.

## Sobre o produto

O FitTrack resolve a dispersão de dados de quem treina: cadernos, planilhas e apps em inglês que não se conversam. Reúne em um só lugar musculação, atividades livres (natação, futebol, corrida), medidas corporais e progressão visual — tudo em português.

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

A documentação é gerada automaticamente a partir do `schema` declarado em cada rota — não há arquivo OpenAPI mantido à mão. Para novas rotas, declare `tags`, `summary` e os schemas de `body`/`params`/`response`, como em [src/routes/health.ts](src/routes/health.ts):

```ts
app.get(
  '/health',
  {
    schema: {
      tags: ['Health'],
      summary: 'Verifica a disponibilidade do servico',
      response: {
        200: {
          type: 'object',
          properties: { status: { type: 'string', const: 'ok' } },
        },
      },
    },
  },
  async () => ({ status: 'ok' }),
);
```

Rotas autenticadas devem referenciar o security scheme `bearerAuth`, já declarado em [src/plugins/swagger.ts](src/plugins/swagger.ts):

```ts
schema: { security: [{ bearerAuth: [] }], /* ... */ }
```

Novas áreas da API devem registrar sua tag na lista `tags` do mesmo arquivo (ex.: `Auth`, `Treinos`, `Atividades`, `Admin`).

**Exposição:** o Swagger fica habilitado por padrão fora de produção. Em `NODE_ENV=production` ele é desligado, a menos que `ENABLE_SWAGGER=true` seja definido explicitamente.

## Scripts

| Script              | Descrição                                        |
| ------------------- | ------------------------------------------------ |
| `yarn dev`          | Servidor em modo watch (tsx)                     |
| `yarn build`        | Compila TypeScript para `dist/`                  |
| `yarn start`        | Executa a build de `dist/`                       |
| `yarn lint`         | ESLint (regras Airbnb)                           |
| `yarn lint:fix`     | ESLint com correção automática                   |
| `yarn format`       | Formata o projeto com Prettier                   |
| `yarn format:check` | Verifica formatação sem alterar arquivos         |
| `yarn db:up`        | Sobe o container do PostgreSQL                   |
| `yarn db:down`      | Derruba o container (o volume de dados persiste) |

## Estrutura

```
src/
  server.ts           # bootstrap: listen + graceful shutdown
  app.ts              # buildApp(): instância Fastify, plugins e rotas
  config/env.ts       # carrega e valida variáveis de ambiente (zod, fail-fast)
  plugins/swagger.ts  # OpenAPI 3.1 + Swagger UI
  routes/health.ts    # GET /health
```

`app.ts` é separado de `server.ts` para permitir testes que importem `buildApp()` sem abrir porta.

## Variáveis de ambiente

Definidas em `.env` (não versionado) — use `.env.example` como referência. A aplicação **não sobe** se alguma variável obrigatória estiver ausente ou inválida.

| Variável                                                                | Descrição                               |
| ----------------------------------------------------------------------- | --------------------------------------- |
| `NODE_ENV`                                                              | `development` \| `test` \| `production` |
| `PORT` / `HOST`                                                         | Endereço de escuta do servidor          |
| `LOG_LEVEL`                                                             | Nível do logger (pino)                  |
| `ENABLE_SWAGGER`                                                        | `true` \| `false` — expõe `/docs`       |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `POSTGRES_PORT` | Usadas pelo `docker-compose.yml`        |
| `DATABASE_URL`                                                          | String de conexão usada pela aplicação  |

## Banco de dados

O `docker-compose.yml` sobe um PostgreSQL 17 com healthcheck e volume nomeado (`forma-pgdata`) — os dados sobrevivem a `yarn db:down`.

```bash
yarn db:up
docker compose ps      # postgres deve aparecer como "healthy"
```

Nenhum ORM ou migration está configurado ainda: a escolha da camada de acesso a dados vem junto com a modelagem de roles e sessões da Fase 1 do roadmap.

## Qualidade de código

- **Lint:** ESLint 9 (flat config) com regras Airbnb via `eslint-config-airbnb-extended`, mais `eslint-config-prettier` para evitar conflitos de formatação.
- **Formatação:** Prettier (`.prettierrc`).
- **Commits:** prefixos obrigatórios (`[FEAT] `, `[FIX] `, `[DOCS] `, `[TEST] `, `[CHORE] `, `[BUILD] `) validados por commitlint + husky — ver [COMMIT_CONVENTION.md](COMMIT_CONVENTION.md).
