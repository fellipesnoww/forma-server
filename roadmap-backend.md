# Roadmap Backend — Forma (Checklist)

> Checklist de entregas do **forma-server** derivado do [roadmap-features.md](roadmap-features.md). Marque `[x]` conforme concluir cada item.
>
> **Stack:** Node.js 24 · TypeScript · Fastify 5 · PostgreSQL 17 · OpenAPI 3.1 · Zod

**Como usar:** siga a [ordem sugerida](#ordem-de-implementação) no final. Itens marcados como *cliente* não são escopo backend. Ao concluir cada etapa, registre a implementação em [`sdd/`](#documentação-sdd).

---

## Progresso geral

| Fase | Status |
|---|---|
| 0 — Fundação técnica | 🟨 parcial (Dockerfile, staging e testes pendentes) |
| 1 — MVP Core | 🟨 parcial (1.1–1.4 concluídas; 1.0, 1.5–1.6 pendentes) |
| 2 — Completude do usuário | ⬜ |
| 3 — Painel administrativo | ⬜ |
| 4 — Gamificação | ⬜ |
| 5 — Experiência avançada | ⬜ |
| 6 — Integrações e expansão | ⬜ |

---

## Convenções (referência)

### Arquitetura — package by feature

O código de domínio fica organizado **por feature** (vertical slice), não por camada técnica (`routes/`, `services/` globais). Cada feature encapsula rotas, regras de negócio, schemas e acesso a dados daquele bounded context.

```
src/
  server.ts                 # bootstrap: listen + graceful shutdown
  app.ts                    # buildApp(): plugins globais + registra features
  config/                   # env, constantes de app
  plugins/                  # infra Fastify transversal (swagger, auth, errors, rate-limit)
  shared/                   # código usado por 3+ features (db client, AppError, pagination)
  db/
    seed/                   # seeds globais (migrations ficam em prisma/migrations/)
  features/
    health/
      index.ts              # export público: registerHealthRoutes(app)
      health.routes.ts
      health.schemas.ts
    auth/
      index.ts
      auth.routes.ts
      auth.service.ts
      auth.repository.ts
      auth.schemas.ts
    profile/
      index.ts
      profile.routes.ts
      profile.service.ts
      profile.repository.ts
      profile.schemas.ts
    exercises/
    workout-sheets/
    workout-sessions/
    activities/
    calendar/
    progress/
    admin/
    achievements/
    challenges/
    notifications/
    export/
    sync/
```

| Regra | Diretriz |
|---|---|
| **Colocation** | Tudo da feature vive dentro de `features/<nome>/` |
| **Export público** | Outras features importam só de `features/<nome>/index.ts` |
| **Sem import interno cruzado** | `features/auth/` não importa `auth.service.ts` de outra feature diretamente |
| **Registro no app** | `app.ts` chama `registerXRoutes(app)` exportado pelo `index.ts` de cada feature |
| **Schemas** | Zod por feature (`*.schemas.ts`); converter para JSON Schema no handler da rota |
| **Repository** | Acesso a tabelas da feature fica no `*.repository.ts` local; queries de outra feature passam pelo service público |
| **`shared/` mínimo** | Só entra aqui o que é genuinamente transversal (cliente DB, erros HTTP, helpers de paginação) |
| **`plugins/`** | Hooks/decorações Fastify reutilizáveis (`authenticate`, `requireRole`) — não lógica de domínio |
| **Admin** | Rotas admin ficam em `features/admin/` (subpastas opcionais: `users/`, `exercises/`) |
| **Nomenclatura** | Pastas em kebab-case (`workout-sessions/`); arquivos em camelCase ou kebab-case consistente |
| **SDD** | Ao concluir etapa, criar/atualizar markdown em `sdd/` (ver [Documentação SDD](#documentação-sdd)) |

**Template ao criar uma feature:**

```
features/<nome>/
  index.ts              # register<Nome>Routes(app): Promise<void>
  <nome>.routes.ts      # define rotas Fastify + schemas OpenAPI
  <nome>.service.ts     # regras de negócio
  <nome>.repository.ts  # queries/mutations SQL ou ORM
  <nome>.schemas.ts     # Zod: body, params, query, response
```

**Exemplo de `index.ts`:**

```ts
export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes, { prefix: '/auth' });
}
```

**Mapa feature ↔ tag OpenAPI:**

| Pasta | Tag OpenAPI | Prefixo de rota |
|---|---|---|
| `health` | `Health` | `/health` |
| `auth` | `Auth` | `/auth` |
| `profile` | `Perfil` | `/profile` |
| `exercises` | `Exercicios` | `/exercises` |
| `workout-sheets` | `Planilhas` | `/workout-sheets` |
| `workout-sessions` | `Sessoes` | `/workout-sessions` |
| `activities` | `Atividades` | `/activities`, `/activity-types` |
| `calendar` | `Calendario` | `/calendar` |
| `progress` | `Progressao` | `/progress` |
| `admin` | `Admin` | `/admin` |
| `achievements` | `Conquistas` | `/achievements` |
| `challenges` | `Desafios` | `/challenges` |
| `notifications` | `Notificacoes` | `/notifications`, `/devices` |
| `export` | `Exportacao` | `/export`, `/share` |
| `sync` | — | `/sync`, `/integrations` |

### API e domínio

| Tema | Diretriz |
|---|---|
| Autenticação | JWT após OAuth ou login email/senha; header `Authorization: Bearer <token>` |
| Autorização | Roles `user`, `admin`, `super_user`; recursos filtrados por `user_id` |
| OpenAPI | `tags`, `summary`, schemas e `security: [{ bearerAuth: [] }]` |
| Timestamps | `created_at`, `updated_at`; sessões com `performed_at` arbitrário |
| Soft delete | `deleted_at` em planilhas e exercícios custom |
| Paginação admin | `?page=&limit=` → `{ items, total, page, limit }` |
| Erros | `{ "error": { "code", "message", "details?" } }` via handler global em `plugins/` |
| Upload | Serviço em `shared/media/` ou `plugins/media/`; features consomem via interface |

### Documentação SDD

Cada etapa implementada deve ter um **arquivo de referência** na pasta `sdd/` na raiz do projeto (`Software Design & Delivery` / registro de como a etapa foi entregue).

```
sdd/
  README.md                 # índice de todas as etapas documentadas
  _template.md              # template copiável para nova etapa
  fase-0-fundacao-tecnica.md
  1.1-autenticacao.md
  1.2-perfil.md
  ...
```

| Regra | Diretriz |
|---|---|
| **Quando criar** | Ao marcar a etapa como concluída no checklist — no mesmo PR/commit da implementação |
| **Nomenclatura** | kebab-case; prefixo numérico igual ao roadmap (`1.1-autenticacao.md`, `fase-0-fundacao-tecnica.md`) |
| **Onde commitar** | Pasta `sdd/` na raiz do repositório, versionada no git |
| **Conteúdo** | Como foi implementado, não o que será implementado — foco em decisões, não em spec futura |

**Conteúdo mínimo de cada arquivo SDD:**

1. **Etapa** — referência ao item do roadmap (ex.: Fase 1 › 1.1 Autenticação)
2. **Escopo entregue** — checklist do que foi feito
3. **Decisões técnicas** — ORM, libs, padrões escolhidos e por quê
4. **Estrutura criada** — pastas, arquivos principais, migrations
5. **APIs** — rotas implementadas (método + path + breve descrição)
6. **Modelo de dados** — tabelas/colunas relevantes
7. **Variáveis de ambiente** — novas envs necessárias
8. **Como testar** — comandos curl, scripts ou passos manuais
9. **Pendências / débito técnico** — o que ficou fora ou para iterar depois

**Template (`sdd/_template.md`):**

```markdown
# [Título da etapa]

> Roadmap: [link ou referência — ex. Fase 1 › 1.1 Autenticação]
> Data: YYYY-MM-DD

## Escopo entregue

- [ ] ...

## Decisões técnicas

- ...

## Estrutura criada

\`\`\`
src/features/...
\`\`\`

## APIs

| Método | Rota | Descrição |
|---|---|---|

## Modelo de dados

...

## Variáveis de ambiente

| Variável | Descrição |
|---|---|

## Como testar

...

## Pendências

- ...
```

---

## Fase 0 — Fundação técnica

> Pré-requisito para todas as demais fases. **Estimativa:** 1–2 semanas

### Banco de dados e ORM

- [x] Escolher ORM/query layer (Drizzle, Kysely ou Prisma) — **Prisma 7** + `@prisma/adapter-pg`
- [x] Configurar conexão Postgres via `DATABASE_URL`
- [x] Configurar migrations versionadas — `prisma/migrations/` (ver nota abaixo)
- [x] Script `yarn db:migrate` (aplicar migrations)
- [x] Script `yarn db:seed` (dados iniciais)

### Autenticação e autorização (infra)

- [x] Plugin Fastify `authenticate` (validação JWT)
- [x] Decorator/hook `requireRole('admin')`
- [x] Decorator/hook `requireRole('super_user')`
- [x] Formato padronizado de erros HTTP
- [x] Rate limiting em rotas de auth e upload

### Mídia e storage

- [ ] Serviço `MediaService` (upload, resize, WebP/JPEG) — **parcial:** upload e validação entregues; resize/WebP fora de escopo
- [ ] Integração com storage (S3/R2 ou local em dev) — **parcial:** binário em `bytea` no Postgres; S3/R2 é pendência
- [x] Limite de tamanho e validação de MIME type — limite via `MEDIA_MAX_SIZE_MB`, MIME detectado por magic number

### Observabilidade e deploy

- [x] `GET /health` (já existe — validar)
- [x] `GET /health/db` (ping Postgres)
- [ ] Dockerfile — fora de escopo da Fase 0 por decisão do time
- [ ] Ambiente de staging configurado (CI/CD + env separado) — fora de escopo da Fase 0

### Arquitetura package by feature

- [x] Criar estrutura base: `src/features/`, `src/shared/`, `src/db/`
- [x] Migrar `routes/health.ts` → `features/health/` (routes + schemas + index)
- [x] `app.ts` registra features via `registerXRoutes(app)`, não importa arquivos internos
- [x] Handler de erro global em `plugins/error-handler.ts`
- [x] Cliente DB em `shared/db/client.ts`
- [x] Documentar template de feature no README (ou manter referência neste arquivo)

### Documentação SDD

- [x] Criar pasta `sdd/` na raiz do projeto
- [x] Criar `sdd/README.md` (índice das etapas documentadas)
- [x] Criar `sdd/_template.md` (template copiável)
- [x] SDD: `sdd/fase-0-fundacao-tecnica.md` — documentar infra entregue na Fase 0

> **Nota sobre migrations:** foi adotado `prisma/schema.prisma` + `prisma/migrations/` em vez de
> `src/db/migrations/`. Caminho customizado exigiria flag em toda invocação da CLI e quebraria
> `db:studio` e `db:reset`. `src/db/seed/` permanece como previsto.
>
> **Testes automatizados (Vitest)** também ficaram fora do escopo por decisão do time; a
> verificação da Fase 0 foi manual e está documentada em
> [`sdd/fase-0-fundacao-tecnica.md`](sdd/fase-0-fundacao-tecnica.md).

---

## Fase 1 — MVP Core

> **Objetivo:** autenticar, perfilar, exercícios, planilhas e sessões de treino. **Estimativa:** 6–8 semanas
>
> Cada subseção cria um pacote em `features/<nome>/` conforme o [template de feature](#arquitetura--package-by-feature).

### 1.0 Desacoplar o Prisma (dívida da Fase 0)

> Fazer **antes** de 1.1: hoje o Prisma vaza para o augmentation global do Fastify, para o
> error-handler e para a rota de health, então não é possível trocar de ORM mexendo apenas nos
> repositories. Corrigir agora evita que as features 1.1–1.5 herdem o padrão.

- [ ] Criar `features/health/health.repository.ts` (`pingDatabase()`); rota deixa de usar `app.prisma`
- [ ] Mover tradução de erros do Prisma para `shared/db/map-db-error.ts`; `error-handler` fica agnóstico
- [ ] Remover o decorator `app.prisma` e o `PrismaClient` de `src/types/fastify.d.ts`
- [ ] Absorver `findMediaOwner` na interface `MediaService` (hoje é exportado fora dela)

Detalhamento em [`sdd/fase-0-fundacao-tecnica.md`](sdd/fase-0-fundacao-tecnica.md) › Acoplamento com o Prisma.

### 1.1 Autenticação

> Item 1.0 (desacoplar Prisma) foi **deliberadamente pulado** para esta etapa — decisão do
> time. `features/auth/` usa o singleton `prisma` diretamente (mesmo padrão de
> `shared/media/`), sem introduzir acoplamento novo. Ver [`sdd/1.1-autenticacao.md`](sdd/1.1-autenticacao.md).

#### Feature package

- [x] Criar `features/auth/` (`index.ts`, `auth.routes.ts`, `auth.service.ts`, `auth.repository.ts`, `auth.schemas.ts`)

#### SDD

- [x] `sdd/1.1-autenticacao.md` — documentar implementação (OAuth, email/senha, vinculação de contas)

#### Modelagem

- [x] Migration: tabela `users` (`email`, `password_hash`, `oauth_provider`, `oauth_subject`, `role`, `status`)
- [x] Migration: tabela `user_profiles` (`display_name`, `avatar_url`, `onboarding_completed_at`)
- [x] Enum ou constraint: `role` → `user` | `admin` | `super_user`
- [x] Enum ou constraint: `status` → `active` | `inactive` | `banned`
- [x] Índice único: `email` (case-insensitive)
- [x] Índice único: `(oauth_provider, oauth_subject)` (nullable até vincular OAuth)
- [x] Campo `password_hash` nullable (contas somente OAuth não possuem senha)

#### Variáveis de ambiente

- [x] Credenciais OAuth Google
- [x] Credenciais OAuth Apple
- [x] Secrets JWT (access + refresh)

#### Endpoints

- [x] `POST /auth/register` — cria conta com email e senha (+ perfil mínimo) — implementado como `POST /auth`
- [x] `POST /auth/login` — autentica com email e senha, retorna JWT + perfil
- [x] `POST /auth/google` — troca `id_token` Google por JWT + perfil (vincula conta existente se email coincidir)
- [x] `POST /auth/apple` — troca `identity_token` Apple por JWT + perfil (vincula conta existente se email coincidir)
- [x] `POST /auth/refresh` — renova access token
- [x] `POST /auth/logout` — invalida refresh token
- [x] `GET /auth/me` — usuário autenticado + perfil resumido

#### Regras de negócio

- [x] Upsert transacional: primeiro login OAuth cria `users` + `user_profiles`
- [x] Cadastro email/senha: hash com bcrypt ou argon2; nunca persistir senha em plain text — usado argon2
- [x] Validação de senha: comprimento mínimo e regras básicas (documentar no schema Zod)
- [x] `POST /auth/register` rejeita email já cadastrado (409)
- [x] **Vinculação OAuth → conta email/senha:** se OAuth retornar email já existente (conta criada via register), **atualizar** o mesmo `users` — preencher `oauth_provider` + `oauth_subject` — em vez de criar novo usuário
- [x] Vinculação preserva dados existentes (perfil, planilhas, histórico); login OAuth passa a funcionar para a mesma conta
- [x] Conflito: email OAuth ≠ email da conta logada → rejeitar ou exigir fluxo explícito de merge (documentar decisão) — não aplicável ao conjunto de endpoints entregue (nenhum é vinculação autenticada); documentado em `sdd/1.1-autenticacao.md`
- [x] Conta vinculada pode autenticar por email/senha **ou** OAuth
- [x] Role padrão `user` em novos cadastros
- [x] Usuário `banned` ou `inactive` → 403 em rotas autenticadas
- [x] Documentação OpenAPI (tag `Auth`)

#### Testes

> Sem Vitest configurado no repositório (débito da Fase 0). Os cenários abaixo foram
> verificados manualmente via curl durante a implementação — ver `sdd/1.1-autenticacao.md`.

- [x] Register → login email/senha → JWT válido
- [x] Register com email duplicado → 409
- [ ] Register → OAuth (mesmo email) → mesma conta atualizada com `oauth_provider`/`oauth_subject` — lógica implementada, não exercitada ponta a ponta (requer client id real de Google/Apple)
- [ ] Após vinculação OAuth: login email/senha e login OAuth retornam o mesmo `user_id` — idem acima

---

### 1.2 Perfil do usuário

> Avatar reaproveita `dbMediaStorage` da Fase 0 como está — sem resize 512×512 nem limite
> dedicado de 2 MB (mesmo descope de resize/WebP já registrado na Fase 0). Ver
> [`sdd/1.2-perfil.md`](sdd/1.2-perfil.md) › Pendências.

#### Feature package

- [x] Criar `features/profile/` (`index.ts`, routes, service, repository, schemas)

#### SDD

- [x] `sdd/1.2-perfil.md` — documentar implementação

#### Modelagem

- [x] Campos atuais em `user_profiles`: `weight_kg`, `height_cm`, `waist_cm`, `chest_cm`
- [x] Migration: tabela `body_measurements` (histórico append-only)

#### Endpoints

- [x] `GET /profile` — perfil + medidas atuais
- [x] `PATCH /profile` — atualiza nome e medidas atuais
- [x] `POST /profile/avatar` — upload, retorna URL — **parcial:** sem compressão/resize (ver nota acima)
- [x] `GET /profile/measurements` — histórico paginado (`?from=&to=&page=&limit=`)
- [x] `POST /profile/measurements` — novo registro de medidas

#### Regras de negócio

- [x] `POST /profile/measurements` atualiza campos atuais em `user_profiles`
- [x] Validação: peso/altura/cintura/peitoral > 0 (kg, cm)
- [ ] Avatar: resize máx. 512×512, limite ~2 MB — fora de escopo deste PR (ver nota acima)
- [x] Documentação OpenAPI (tag `Perfil`)
- [ ] Testes automatizados — Vitest não configurado (débito da Fase 0); verificado manualmente via curl, ver `sdd/1.2-perfil.md`

---

### 1.3 Exercícios

#### Feature package

- [x] Criar `features/exercises/` (`index.ts`, routes, service, repository, schemas)

#### SDD

- [x] `sdd/1.3-exercicios.md` — documentar implementação

#### Modelagem

- [x] Migration: tabela `muscle_groups` (`name`, `slug`)
- [x] Migration: tabela `exercises` (catálogo global, `is_active`, `media_url`)
- [x] Migration: tabela `custom_exercises` (`user_id`, `deleted_at`)

#### Seed

- [x] Seed: grupos musculares
- [x] Seed: ≥ 80 exercícios categorizados

#### Endpoints (usuário)

- [x] `GET /exercises` — catálogo ativo + custom (`?muscle_group=&q=`)
- [x] `POST /exercises/custom` — cria exercício personalizado
- [x] `PATCH /exercises/custom/:id` — edita (somente dono)
- [x] `DELETE /exercises/custom/:id` — soft delete (somente dono)

#### Regras de negócio

- [x] Custom exercises isolados por `user_id`
- [x] Catálogo padrão somente leitura para `user`
- [x] Documentação OpenAPI (tag `Exercicios`)
- [ ] Testes automatizados — Vitest não configurado (débito da Fase 0); verificado manualmente via curl, ver `sdd/1.3-exercicios.md`

---

### 1.4 Planilha de treino

#### Feature package

- [x] Criar `features/workout-sheets/` (`index.ts`, routes, service, repository, schemas)

#### SDD

- [x] `sdd/1.4-planilhas.md` — documentar implementação

#### Modelagem

- [x] Migration: tabela `workout_sheets` (`user_id`, `name`, `deleted_at`)
- [x] Migration: tabela `sheet_days` (`sheet_id`, `weekday`, `order`)
- [x] Migration: tabela `sheet_exercises` (`exercise_id` ou `custom_exercise_id`, `sort_order`, defaults)

#### Endpoints

- [x] `GET /workout-sheets` — lista planilhas do usuário
- [x] `POST /workout-sheets` — cria planilha + dias + exercícios
- [x] `GET /workout-sheets/:id` — detalhe completo
- [x] `PATCH /workout-sheets/:id` — atualiza nome, dias, exercícios
- [x] `DELETE /workout-sheets/:id` — soft delete
- [x] `PATCH /workout-sheets/:id/reorder` — reordena exercícios por dia

#### Regras de negócio

- [x] Ownership: planilha pertence ao usuário autenticado (queries filtram por `user_id`, dono inexistente vira 404)
- [x] Validar referência a exercício (catálogo ativo ou custom do mesmo usuário) — validado na service, sem CHECK constraint (ver `sdd/1.4-planilhas.md`)
- [x] `weekday` único por planilha (`@@unique([sheetId, weekday])` + validação no Zod)
- [x] Documentação OpenAPI (tag `Planilhas`)
- [ ] Testes automatizados — Vitest não configurado (débito da Fase 0); verificado manualmente via curl, ver `sdd/1.4-planilhas.md`

---

### 1.5 Execução de treino

#### Feature package

- [ ] Criar `features/workout-sessions/` (`index.ts`, routes, service, repository, schemas)

#### SDD

- [ ] `sdd/1.5-sessoes-treino.md` — documentar implementação

#### Modelagem

- [ ] Migration: tabela `workout_sessions` (`sheet_id`, `performed_at`, `photo_url`, `comment`)
- [ ] Migration: tabela `session_exercises`
- [ ] Migration: tabela `session_sets` (`set_number`, `reps`, `weight_kg`, `completed`)
- [ ] Índice: `(user_id, performed_at)`

#### Endpoints

- [ ] `POST /workout-sessions` — registra sessão completa
- [ ] `GET /workout-sessions/:id` — detalhe da sessão
- [ ] `PATCH /workout-sessions/:id` — atualiza sets, foto, comentário
- [ ] `POST /workout-sessions/:id/complete` — finaliza sessão
- [ ] `POST /workout-sessions/:id/photo` — upload foto pós-treino
- [ ] `GET /workout-sessions` — histórico (`?from=&to=&sheet_id=`)

#### Regras de negócio

- [ ] `performed_at` default `now()`; aceita valor passado
- [ ] Validar sets: `reps` ≥ 0, `weight_kg` ≥ 0
- [ ] Compressão de foto e associação à sessão
- [ ] Idempotência em `complete`
- [ ] Documentação OpenAPI (tag `Sessoes`)
- [ ] Testes automatizados cobrindo as regras de negócio da feature

---

### 1.6 Entrega Fase 1

- [ ] Testes de autorização (roles + ownership)
- [ ] Swagger documentando todas as rotas da fase
- [ ] Smoke test end-to-end: login → planilha → sessão → histórico
- [ ] Atualizar `sdd/README.md` com links das etapas 1.1–1.5

---

## Fase 2 — Completude do usuário

> **Objetivo:** atividades livres, calendário, retroativo e progressão. **Estimativa:** 4–6 semanas

### 2.1 Atividades livres

#### Feature package

- [ ] Criar `features/activities/` (`index.ts`, routes, service, repository, schemas)

#### SDD

- [ ] `sdd/2.1-atividades-livres.md` — documentar implementação

#### Modelagem

- [ ] Migration: tabela `activity_types` (seed + `user_id` nullable para custom)
- [ ] Migration: tabela `free_activities` (`performed_at`, `duration_minutes`, `photo_url`)
- [ ] Seed: tipos padrão (natação, futebol, corrida, etc.)

#### Endpoints

- [ ] `GET /activity-types` — tipos padrão + custom do usuário
- [ ] `POST /activity-types/custom` — novo tipo personalizado
- [ ] `GET /activities` — lista (`?from=&to=`)
- [ ] `POST /activities` — registra atividade
- [ ] `GET /activities/:id` — detalhe
- [ ] `PATCH /activities/:id` — edita
- [ ] `DELETE /activities/:id` — remove
- [ ] `POST /activities/:id/photo` — upload foto
- [ ] Documentação OpenAPI (tag `Atividades`)
- [ ] Testes automatizados cobrindo as regras de negócio da feature

---

### 2.2 Calendário

#### Feature package

- [ ] Criar `features/calendar/` (`index.ts`, routes, service, repository, schemas)

#### SDD

- [ ] `sdd/2.2-calendario.md` — documentar implementação

#### Modelagem

- [ ] Campo `timezone` em `user_profiles` (ou convenção documentada com client)

#### Endpoints

- [ ] `GET /calendar` — agregação mensal (`?year=&month=`)
- [ ] `GET /calendar/:date` — detalhe do dia (`YYYY-MM-DD`)

#### Regras de negócio

- [ ] Payload inclui `hasWorkout`, `hasActivity`, `photoUrls[]`, `summary`
- [ ] Limite configurável de thumbnails por dia
- [ ] Agregação considera timezone do usuário
- [ ] Documentação OpenAPI (tag `Calendario`)
- [ ] Testes automatizados cobrindo as regras de negócio da feature

---

### 2.3 Registro retroativo

- [ ] Validação: `performed_at <= now()` (+ tolerância clock skew)
- [ ] Validação aplicada em sessões e atividades (POST/PATCH)
- [ ] Limite retroativo opcional via env (ex.: 90 dias)
- [ ] Testes: data futura rejeitada
- [ ] Testes: meia-noite e timezone
- [ ] Documentação OpenAPI: validações refletidas nos schemas das rotas afetadas

#### SDD

- [ ] `sdd/2.3-registro-retroativo.md` — documentar validações e regras de data

---

### 2.4 Gráficos de progressão

#### Feature package

- [ ] Criar `features/progress/` (`index.ts`, routes, service, repository, schemas)

#### SDD

- [ ] `sdd/2.4-progressao.md` — documentar implementação

#### Endpoints

- [ ] `GET /progress/load` — evolução de carga (`?exercise_id=&from=&to=`)
- [ ] `GET /progress/measurements` — evolução corporal (`?metric=&from=&to=`)

#### Implementação

- [ ] Agregação SQL: `max(weight_kg)`, `sum(reps * weight_kg)` por período
- [ ] Índice: `(user_id, exercise_id, performed_at)`
- [ ] Filtros: 30, 60, 90 dias e intervalo customizado
- [ ] Documentação OpenAPI (tag `Progressao`)
- [ ] Testes automatizados cobrindo as regras de negócio da feature

---

### 2.5 Entrega Fase 2

- [ ] Testes de performance em agregações de calendário e progressão
- [ ] Smoke test: atividade retroativa aparece no calendário e nos gráficos
- [ ] Atualizar `sdd/README.md` com links das etapas 2.1–2.4

---

## Fase 3 — Painel administrativo

> **Objetivo:** rotas `/admin/*`, auditoria e gestão. **Estimativa:** 3–4 semanas

### 3.1 Infra admin

#### Feature package

- [ ] Criar `features/admin/` (subpastas opcionais: `exercises/`, `users/`, `audit/`)
- [ ] `features/admin/index.ts` registra sub-rotas com prefixo `/admin`

- [ ] Namespace `/admin` registrado no Fastify
- [ ] Guard `requireRole('admin')` em rotas admin
- [ ] Guard `requireRole('super_user')` em rotas exclusivas
- [ ] Migration: tabela `admin_audit_logs`
- [ ] Documentação OpenAPI (tag `Admin`, namespace `/admin`)
- [ ] Testes automatizados: guards de role bloqueiam acesso indevido

#### SDD

- [ ] `sdd/3.1-infra-admin.md` — documentar namespace, guards e audit log

---

### 3.2 Gestão de exercícios (admin)

#### Endpoints

- [ ] `GET /admin/exercises` — lista com filtros (inclui inativos)
- [ ] `POST /admin/exercises` — cria exercício + upload mídia
- [ ] `PATCH /admin/exercises/:id` — edita
- [ ] `PATCH /admin/exercises/:id/status` — ativa/desativa
- [ ] `GET /admin/muscle-groups` — listagem
- [ ] `POST /admin/muscle-groups` — cria categoria
- [ ] `PATCH /admin/muscle-groups/:id` — edita categoria
- [ ] Documentação OpenAPI (tag `Admin`)
- [ ] Testes automatizados cobrindo as regras de negócio da feature

#### SDD

- [ ] `sdd/3.2-admin-exercicios.md` — documentar implementação

### 3.3 Gestão de usuários (admin)

#### Endpoints

- [ ] `GET /admin/users` — lista paginada (`?q=&status=&role=`)
- [ ] `GET /admin/users/:id` — perfil + estatísticas
- [ ] `PATCH /admin/users/:id/status` — `active` | `inactive` | `banned`

#### Endpoints (super user)

- [ ] `PATCH /admin/users/:id/role` — promove para `admin`

#### Regras de negócio

- [ ] Admin não altera outro admin/super_user (apenas super_user)
- [ ] Alterações de status/role registradas em audit log
- [ ] Documentação OpenAPI (tag `Admin`)
- [ ] Testes automatizados cobrindo as regras de negócio da feature

#### SDD

- [ ] `sdd/3.3-admin-usuarios.md` — documentar implementação

### 3.4 Gestão de administradores (super user)

#### Endpoints

- [ ] `GET /admin/admins` — lista admins e super_users
- [ ] `PATCH /admin/admins/:id/role` — promove/rebaixa
- [ ] `GET /admin/audit-logs` — log paginado (`?actor_id=&action=&from=&to=`)
- [ ] Documentação OpenAPI (tag `Admin`)
- [ ] Testes automatizados cobrindo as regras de negócio da feature

#### SDD

- [ ] `sdd/3.4-admin-super-user.md` — documentar implementação

### 3.5 Conquistas e desafios (admin)

#### Feature package

- [ ] Estender `features/admin/` ou criar `features/achievements/` e `features/challenges/` (modelos admin + endpoints públicos na Fase 4)

#### Modelagem

- [ ] Migration: tabela `achievements` (`criteria` JSON, `icon_url`, `is_active`)
- [ ] Migration: tabela `challenges` (`goal` JSON, `starts_at`, `ends_at`, `is_active`)
- [ ] Migration: tabelas `user_achievements`, `user_challenges` (estrutura base)

#### Endpoints

- [ ] CRUD `/admin/achievements`
- [ ] CRUD `/admin/challenges`
- [ ] `GET /admin/achievements/:id/unlocks` — usuários que desbloquearam

#### Regras de negócio

- [ ] Schema de `criteria`: `streak_days`, `workout_count`, `challenge_complete`
- [ ] Documentação OpenAPI (tag `Admin`)
- [ ] Testes automatizados cobrindo as regras de negócio da feature

#### SDD

- [ ] `sdd/3.5-admin-conquistas-desafios.md` — documentar implementação

### 3.6 Entrega Fase 3

- [ ] Testes: escalada indevida de permissão bloqueada
- [ ] Testes: audit log gerado em ações sensíveis
- [ ] Atualizar `sdd/README.md` com links das etapas 3.1–3.5

---

## Fase 4 — Gamificação

> **Objetivo:** motor de critérios, desafios, streaks e notificações in-app. **Estimativa:** 3–4 semanas

### 4.1 Motor de conquistas

#### Feature package

- [ ] Completar `features/achievements/` (motor de critérios + rotas de usuário)

- [ ] Strategy extensível por `criteria.type`
- [ ] Avaliação pós-`workout-sessions/complete`
- [ ] Avaliação pós-registro de atividade
- [ ] Insert idempotente em `user_achievements` (unique `user_id + achievement_id`)
- [ ] Emissão de notificação in-app ao desbloquear

#### Endpoints

- [ ] `GET /achievements` — vitrine (desbloqueadas + bloqueadas)
- [ ] `GET /achievements/mine` — somente desbloqueadas
- [ ] Documentação OpenAPI (tag `Conquistas`)
- [ ] Testes automatizados cobrindo as regras de negócio da feature

#### SDD

- [ ] `sdd/4.1-conquistas.md` — documentar motor de critérios e rotas

### 4.2 Desafios (usuário)

#### Feature package

- [ ] Completar `features/challenges/` (rotas de usuário + ranking)

#### Endpoints

- [ ] `GET /challenges/active` — desafios vigentes
- [ ] `POST /challenges/:id/join` — participação
- [ ] `GET /challenges/:id/progress` — progresso do usuário
- [ ] `GET /challenges/:id/ranking` — leaderboard paginado
- [ ] `GET /challenges/history` — concluídos pelo usuário

#### Regras de negócio

- [ ] Atualização de progresso em eventos de treino/atividade
- [ ] Ranking com desempate determinístico (`updated_at`)
- [ ] Documentação OpenAPI (tag `Desafios`)
- [ ] Testes automatizados cobrindo as regras de negócio da feature

#### SDD

- [ ] `sdd/4.2-desafios.md` — documentar implementação

### 4.3 Streaks

#### Feature package

- [ ] Lógica de streak em `features/calendar/` ou `shared/streak/` consumido por calendar + achievements

- [ ] Função `computeStreak(userId, timezone)`
- [ ] Campo `currentStreak` / `longestStreak` em perfil ou `/stats`
- [ ] Campos de streak no payload de `GET /calendar`
- [ ] Conquistas automáticas nos marcos 7, 30, 60, 90 dias
- [ ] Cache opcional: tabela `user_streaks`
- [ ] Documentação OpenAPI: campos de streak refletidos no schema de `GET /calendar`
- [ ] Testes automatizados: `computeStreak` cobre virada de dia/timezone e marcos de conquista

#### SDD

- [ ] `sdd/4.3-streaks.md` — documentar implementação

### 4.4 Notificações in-app

#### Feature package

- [ ] Criar `features/notifications/` (`index.ts`, routes, service, repository, schemas)

#### Modelagem

- [ ] Migration: tabela `notifications`

#### Endpoints

- [ ] `GET /notifications` — inbox paginada
- [ ] `PATCH /notifications/:id/read` — marca como lida
- [ ] Documentação OpenAPI (tag `Notificacoes`)
- [ ] Testes automatizados cobrindo as regras de negócio da feature

#### SDD

- [ ] `sdd/4.4-notificacoes-in-app.md` — documentar implementação

### 4.5 Entrega Fase 4

- [ ] Testes: desbloqueio de conquista não duplica em `complete` repetido
- [ ] Testes: streak calculado corretamente com timezone
- [ ] Atualizar `sdd/README.md` com links das etapas 4.1–4.4

---

## Fase 5 — Experiência avançada

> **Objetivo:** produtividade no treino e push notifications. Modo escuro = *cliente*. **Estimativa:** 3–5 semanas

### 5.1 Qualidade de vida no treino

#### Endpoints

- [ ] `GET /exercises/:id/last-session` — última carga/reps (sugestão)
- [ ] `POST /workout-sheets/:id/duplicate` — clona planilha + dias + exercícios

#### Opcional

- [ ] Campo `default_rest_seconds` em `sheet_exercises` (suporte a cronômetro no client)

#### Qualidade

- [ ] Documentação OpenAPI (tag `Planilhas`/`Exercicios`, conforme rota)
- [ ] Testes automatizados cobrindo as regras de negócio da feature

#### SDD

- [ ] `sdd/5.1-qualidade-vida-treino.md` — documentar implementação

### 5.2 Notificações push

#### Feature package

- [ ] Estender `features/notifications/` (device tokens, preferences, jobs push)

#### Modelagem

- [ ] Migration: tabela `device_tokens` (`platform`, `token`)
- [ ] Migration: tabela `notification_preferences`

#### Endpoints

- [ ] `POST /devices` — registra token FCM/APNs
- [ ] `DELETE /devices/:token` — remove token
- [ ] `GET /notification-preferences` — lê preferências
- [ ] `PATCH /notification-preferences` — atualiza preferências

#### Jobs e integrações

- [ ] Integração FCM + APNs (Firebase Admin SDK ou similar)
- [ ] Cron: lembretes de treino nos dias da planilha
- [ ] Event-driven: push ao desbloquear conquista
- [ ] Event-driven: push ao publicar desafio (`POST /admin/challenges`)
- [ ] Documentação OpenAPI (tag `Notificacoes`)
- [ ] Testes automatizados cobrindo as regras de negócio da feature

#### SDD

- [ ] `sdd/5.2-notificacoes-push.md` — documentar implementação

### 5.3 Entrega Fase 5

- [ ] Testes: preferências respeitadas (usuário opt-out não recebe push)
- [ ] Testes: duplicar planilha preserva ordem e defaults
- [ ] Atualizar `sdd/README.md` com links das etapas 5.1–5.2

---

## Fase 6 — Integrações e expansão

> **Objetivo:** health sync, exportação e offline. **Estimativa:** 4–6 semanas

### 6.1 Integrações de saúde

#### Feature package

- [ ] Criar `features/integrations/` ou subpasta `features/sync/health/` para health sync

#### Endpoints

- [ ] `POST /integrations/health/sync` — batch de atividades/peso do client
- [ ] `GET /integrations/health/status` — estado da integração
- [ ] `DELETE /integrations/health` — revoga sync

#### Regras de negócio

- [ ] Resolução de conflitos (last-write-wins ou merge por `recorded_at`)
- [ ] Persistência de snapshots sincronizados
- [ ] Documentação OpenAPI (tag a definir para `/integrations`)
- [ ] Testes automatizados cobrindo as regras de negócio da feature

#### SDD

- [ ] `sdd/6.1-integracoes-saude.md` — documentar implementação

### 6.2 Exportação e compartilhamento

#### Feature package

- [ ] Criar `features/export/` (`index.ts`, routes, service, schemas)

#### Endpoints

- [ ] `GET /export/workouts.pdf` — stream PDF (`?from=&to=`)
- [ ] `GET /export/workouts.csv` — dados tabulares
- [ ] `GET /share/workout-sessions/:id/card` — imagem ou payload OG

#### Implementação

- [ ] Geração PDF (pdfkit, puppeteer ou serviço externo)
- [ ] CSV com streaming para históricos grandes
- [ ] Rate limit em rotas de exportação
- [ ] Documentação OpenAPI (tag `Exportacao`)
- [ ] Testes automatizados cobrindo as regras de negócio da feature

#### SDD

- [ ] `sdd/6.2-exportacao.md` — documentar implementação

### 6.3 Modo offline (sync)

#### Feature package

- [ ] Criar `features/sync/` (`index.ts`, routes, service, schemas)

#### Endpoints

- [ ] `GET /sync/pull` — delta desde cursor (`?since=`)
- [ ] `POST /sync/push` — batch de mutações com `client_id`
- [ ] `GET /sync/status` — último sync e conflitos pendentes

#### Regras de negócio

- [ ] Idempotência via `client_generated_id`
- [ ] Política de conflito documentada e implementada
- [ ] Documentação OpenAPI (tag a definir para `/sync`)
- [ ] Testes automatizados cobrindo as regras de negócio da feature

#### SDD

- [ ] `sdd/6.3-sync-offline.md` — documentar implementação

### 6.4 Entrega Fase 6

- [ ] Testes: push/pull idempotente (mesmo `client_id` não duplica)
- [ ] Testes: export CSV/PDF com intervalo grande
- [ ] Atualizar `sdd/README.md` com links das etapas 6.1–6.3

---

## Ordem de implementação

Marque na sequência abaixo para minimizar retrabalho:

1. [x] **Fase 0** — ORM, migrations, auth plugin, media service
2. [x] **1.1** — Auth (OAuth + email/senha + vinculação de contas)
3. [x] **1.3** — Exercises (seed) + custom exercises
4. [x] **1.4** — Workout sheets
5. [ ] **1.5** — Workout sessions + upload foto
6. [x] **1.2** — Body measurements history
7. [ ] **2.1** — Free activities + activity types
8. [ ] **2.2–2.3** — Calendar + validação retroativa
9. [ ] **2.4** — Progress endpoints
10. [ ] **Fase 3** — Admin: exercises, users, audit
11. [ ] **Fase 4** — Achievements, challenges, streaks
12. [ ] **Fase 5** — Push + preferences
13. [ ] **Fase 6** — Export + sync + health

---

## Resumo por fase

| Fase | Entregável | Prioridade | Estimativa |
|---|---|---|---|
| 0 | Infra técnica (ORM, auth, media, staging) | 🔴 Crítica | 1–2 semanas |
| 1 | Auth, perfil, exercícios, planilhas, sessões | 🔴 Crítica | 6–8 semanas |
| 2 | Atividades, calendário, progressão | 🔴 Crítica | 4–6 semanas |
| 3 | Admin completo + auditoria | 🟠 Alta | 3–4 semanas |
| 4 | Gamificação, streaks, notificações in-app | 🟠 Alta | 3–4 semanas |
| 5 | Push, duplicar planilha, sugestão de carga | 🟡 Média | 3–5 semanas |
| 6 | Export, health sync, offline sync | 🟢 Futura | 4–6 semanas |

---

## Referências

- [roadmap-features.md](roadmap-features.md) — visão produto completa
- [escopo-negocio.md](escopo-negocio.md) — contexto de negócio e métricas
- [README.md](README.md) — stack, setup e convenções OpenAPI
- [sdd/](sdd/) — registros de implementação por etapa (SDD)
