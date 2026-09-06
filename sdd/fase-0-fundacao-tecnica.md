# Fase 0 — Fundação técnica

> Roadmap: [roadmap-backend.md](../roadmap-backend.md) › Fase 0 — Fundação técnica
> Data: 2026-09-06

Infraestrutura transversal sobre a qual as features 1.1–6.3 serão construídas: ORM e migrations,
envelope de erro padronizado, autenticação/autorização, rate limiting, serviço de mídia,
observabilidade e a arquitetura package-by-feature.

## Escopo entregue

- [x] Prisma configurado com Postgres via `DATABASE_URL`, migrations versionadas e seed
- [x] Scripts `db:generate`, `db:migrate`, `db:deploy`, `db:seed`, `db:studio`, `db:reset`
- [x] Plugin `authenticate` (validação JWT) e `requireRole('admin' | 'super_user')`
- [x] Formato padronizado de erros HTTP com handler global
- [x] Rate limiting global + configuração estrita reutilizável para upload e auth
- [x] `MediaService` com validação de MIME e limite de tamanho, gravando em `bytea`
- [x] `GET /health` migrado e validado; `GET /health/db` com ping ao Postgres
- [x] Estrutura `src/features/`, `src/shared/`, `src/db/`; health migrado para feature package
- [x] `app.ts` registra features apenas via `registerXRoutes(app)`
- [x] Ponte Zod → JSON Schema para validação e documentação OpenAPI
- [x] Pasta `sdd/` com índice, template e este documento
- [ ] Dockerfile — fora de escopo por decisão do time (ver Pendências)
- [ ] Ambiente de staging / CI-CD — fora de escopo por decisão do time
- [ ] Testes automatizados — fora de escopo por decisão do time; verificação foi manual

## Decisões técnicas

### ORM: Prisma 7 com driver adapter

Prisma 7.10.0 com o gerador **`prisma-client`** (o novo padrão) emitindo TypeScript em
`src/generated/prisma`, com `moduleFormat = "esm"` e `importFileExtension = "js"` — obrigatório
porque o projeto usa `moduleResolution: NodeNext`, que exige extensão explícita nos imports
relativos.

Havia um risco real de o código gerado não compilar sob `strict` + `noUncheckedIndexedAccess`
(`skipLibCheck` não cobre arquivos `.ts`, e `exclude` não impede a checagem de um arquivo
importado). Foi validado antes de qualquer outro trabalho: os 9 arquivos gerados compilam limpos.
O plano B — voltar ao gerador legado `prisma-client-js`, que emite JS + `.d.ts` em `node_modules`
— não foi necessário.

Duas mudanças do Prisma 7 exigiram ajuste:

- **`datasource.url` foi removido do schema.** A conexão vem do driver adapter (`@prisma/adapter-pg`)
  configurado em `prisma.config.ts`.
- **`prisma migrate dev` ainda exige `datasource.url` no config file**, porque cria e derruba um
  shadow database e para isso precisa de conexão direta, além do adapter.

### Localização do schema: `prisma/`, não `src/db/migrations/`

O roadmap previa `src/db/migrations/`. Foi adotado `prisma/schema.prisma` + `prisma/migrations/`
(convenção do Prisma): um caminho customizado exigiria flag em toda invocação da CLI e quebraria
`db:studio` e `db:reset`. `src/db/seed/` permanece como o roadmap define, porque seeds são código
de aplicação. A árvore de convenções do roadmap foi corrigida.

### Fase 0 não cria a tabela `users`

`users` pertence à Fase 1.1, que precisa de `email`, `password_hash`, `oauth_provider`,
`oauth_subject`, enums de `role`/`status` e índices únicos. Criar uma versão reduzida aqui geraria
conflito de migration depois.

Consequência: `authenticate` valida **apenas as claims do JWT**, sem consultar o banco, e
`media_assets.owner_id` é `uuid` **sem foreign key**. Adicionar a FK e a checagem de
`status` (banned/inactive → 403) são itens explícitos da 1.1.

### Ponte Zod → JSON Schema: `fastify-type-provider-zod`

Escolhido em vez do `z.toJSONSchema()` nativo do Zod 4 porque fornece o pacote completo:
`validatorCompiler`, `serializerCompiler` e os hooks `transform`/`transformObject` que o
`@fastify/swagger` consome. Com a conversão manual seria preciso converter schema a schema em
cada rota, e a inferência de tipos no handler se perderia.

Efeito colateral relevante: com o `serializerCompiler` ativo, **qualquer schema não-Zod em
`response` lança `InvalidSchemaError`**. Isso obrigou a migrar `routes/health.ts` (que usava JSON
Schema cru) no mesmo passo.

### JWT: `@fastify/jwt`

Preferido a `jose` pela integração com o ciclo do Fastify (`request.jwtVerify()`, decorators
tipados). O payload é `{ sub, role, typ }`, e `authenticate` **rejeita `typ !== 'access'`** — sem
essa checagem um refresh token de 30 dias valeria como access token de 15 minutos.

A hierarquia de papéis (`user < admin < super_user`) vive em `src/shared/auth/roles.ts`, fora de
`plugins/`, porque a Fase 3 precisa da mesma regra em services (ex.: "admin não altera outro
admin"), onde não há request HTTP.

### Mídia: base64 → `bytea` no Postgres

Sem S3/R2 nesta fase. O cliente envia base64 em JSON, o servidor decodifica e grava o binário em
`media_assets.data`. Escolhido `bytea` em vez de `TEXT` com o base64 cru: ocupa ~25% menos espaço
e permite servir o binário com `Content-Type` correto.

**Ordem de validação (barato → caro).** Cada etapa existe para evitar a alocação da próxima:

1. `bodyLimit` da rota, antes do parse — o default do Fastify é 1 MB, e um base64 de 5 MB
   (~6,7 MB) morreria com `FST_ERR_CTP_BODY_TOO_LARGE`.
2. Zod: MIME na whitelist, `data` string não-vazia.
3. Strip do prefixo data URL; divergência com o `mimeType` declarado → 400.
4. Charset e padding base64. Necessário porque **`Buffer.from(s, 'base64')` do Node é leniente**:
   descarta caracteres inválidos em silêncio e devolve um buffer truncado em vez de erro.
5. Tamanho decodificado previsto por aritmética sobre o comprimento da string → 413 sem alocar
   nada.
6. Decodifica e confere o tamanho real contra o previsto.
7. Magic number do buffer.

O `.max()` no schema Zod foi **removido de propósito**: a checagem aritmética do passo 5 é
igualmente barata (não aloca buffer) e responde 413, enquanto o `.max()` produzia um 400
`VALIDATION_ERROR` para um arquivo grande demais — status errado para a causa.

**MIME é detectado, não confiado.** O tipo persistido vem sempre do magic number do conteúdo;
divergência com o declarado → 415. Confiar no campo enviado significaria servir depois um
`Content-Type` escolhido pelo cliente — vetor de XSS (HTML declarado como `image/png`). A
detecção usa `buffer.subarray(0, n).equals(...)` e não indexação (`buf[0] === 0x89`), porque com
`noUncheckedIndexedAccess` cada acesso indexado seria `number | undefined`.

**A URL é montada pelo storage**, nunca por quem chama: `MEDIA_PUBLIC_BASE_URL + '/media/' + id`.
É isso que permitirá apontar para um CDN sem tocar nas features que persistem `photo_url`.

### Outras decisões pontuais

- **`errorResponseBuilder` do `@fastify/rate-limit` retorna um _erro_, não um corpo de resposta.**
  O objeto retornado chega ao handler global; sem `statusCode: 429` nele, o handler classificava
  o 429 como 500. Custou um ciclo de depuração e está comentado no código.
- **Rotas de path vazio (`''`) em vez de `'/'`.** Com `'/'` + prefixo, o Fastify registra
  `/health/` e é essa a forma que aparece no OpenAPI. Path vazio registra exatamente `/health`.
- **`GET /media/:id` responde 404, não 403,** para arquivo de outro usuário — um 403 confirmaria
  que o id existe.
- **`Bytes` do Prisma 7 é `Uint8Array`, não `Buffer`.** Na leitura, o binário é envolvido em
  `Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength)` (view, sem cópia); passar o `Uint8Array`
  direto faria o Fastify serializar um JSON de índices. Na escrita, `new Uint8Array(buffer)`
  satisfaz o tipo `Uint8Array<ArrayBuffer>` esperado pelo Prisma.
- **A rota de download não declara schema de resposta 200**, de propósito: um schema Zod
  converteria o Buffer em JSON; sem schema, o Fastify envia o binário intacto.
- **`container_name` do Postgres mudou** para `forma-server-postgres`: o nome anterior
  (`forma-postgres`) colide com um container do projeto legado `health-app-server`.
- **`build` limpa `dist/` antes de compilar** — sem isso, `dist/routes/` sobreviveu à remoção de
  `src/routes/`.

## Estrutura criada

```
prisma/
  schema.prisma
  migrations/20260906190246_init_media_assets/migration.sql
prisma.config.ts
sdd/
  README.md
  _template.md
  fase-0-fundacao-tecnica.md
src/
  server.ts
  app.ts
  config/env.ts
  generated/prisma/**                    (gitignored, recriado por yarn db:generate)
  types/fastify.d.ts                     (module augmentation: prisma, authenticate, requireRole, user)
  plugins/
    swagger.ts
    error-handler.ts
    prisma.ts
    auth.ts
    rate-limit.ts
  shared/
    errors/{app-error.ts,index.ts}
    db/client.ts
    auth/{roles.ts,index.ts}
    media/{media.types.ts,media.validation.ts,db-media-storage.ts,index.ts}
  features/
    health/{index.ts,health.routes.ts,health.schemas.ts}
    media/{index.ts,media.routes.ts,media.schemas.ts}
  db/seed/index.ts
  dev/mint-token.ts
```

Removido: `src/routes/health.ts` e o diretório `src/routes/`.

### Ordem de registro em `app.ts`

Cada linha depende da anterior:

```
Fastify({logger})
  → setValidatorCompiler / setSerializerCompiler   (antes de qualquer rota)
  → helmet, cors
  → errorHandlerPlugin
  → prismaPlugin        (decorator app.prisma)
  → authPlugin          (decorators authenticate / requireRole)
  → rateLimitPlugin     (hooks globais, antes das rotas)
  → registerSwagger     (coleta schemas → antes das rotas)
  → registerHealthRoutes(app)
  → registerMediaRoutes(app)
```

## APIs

| Método | Rota         | Descrição                                                        |
| ------ | ------------ | ---------------------------------------------------------------- |
| GET    | `/health`    | Status do serviço e uptime. Isento de rate limit.                |
| GET    | `/health/db` | Ping ao Postgres com latência. 200 `ok`/`degraded`, 503 `error`. |
| POST   | `/media`     | Upload de arquivo em base64. Autenticado, rate limit estrito.    |
| GET    | `/media/:id` | Download do binário. Dono ou admin; caso contrário 404.          |

Envelope de erro, uniforme em todas as rotas:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} } }
```

| `code`                   | HTTP | Origem                                                      |
| ------------------------ | ---- | ----------------------------------------------------------- |
| `VALIDATION_ERROR`       | 400  | Schema Zod da rota, `ZodError`, 4xx genérico                |
| `UNAUTHORIZED`           | 401  | `authenticate`, erros `FST_JWT_*`                           |
| `FORBIDDEN`              | 403  | `requireRole` com papel insuficiente                        |
| `NOT_FOUND`              | 404  | Rota inexistente, recurso ausente, Prisma `P2025`           |
| `CONFLICT`               | 409  | Prisma `P2002` (único) e `P2003` (FK)                       |
| `PAYLOAD_TOO_LARGE`      | 413  | `bodyLimit` da rota e limite de tamanho da mídia            |
| `UNSUPPORTED_MEDIA_TYPE` | 415  | MIME fora da whitelist ou divergente do conteúdo            |
| `RATE_LIMITED`           | 429  | `@fastify/rate-limit`                                       |
| `INTERNAL_ERROR`         | 500  | Exceção não mapeada; em produção sem mensagem nem `details` |

## Modelo de dados

Tabela `media_assets` (única da fase):

| Coluna       | Tipo                    | Notas                                            |
| ------------ | ----------------------- | ------------------------------------------------ |
| `id`         | `uuid` PK               | Gerado pela aplicação                            |
| `owner_id`   | `uuid` nullable         | Futuro FK para `users.id` (Fase 1.1)             |
| `mime_type`  | `varchar(100)`          | **Detectado** pelo conteúdo, não o declarado     |
| `size_bytes` | `integer`               | Tamanho do arquivo decodificado                  |
| `filename`   | `varchar(255)` nullable | Nome original, opcional                          |
| `data`       | `bytea`                 | Binário; será substituído por chave S3 no futuro |
| `created_at` | `timestamptz(3)`        | Default `CURRENT_TIMESTAMP`                      |

Índice: `(owner_id, created_at)` — listagem de mídia por usuário em ordem cronológica.

**Convenção herdada pelas fases seguintes:** as colunas `avatar_url`, `photo_url` e `media_url`
guardam a **string `url`** devolvida por `upload()` (`/media/<uuid>`), não o uuid cru.

## Variáveis de ambiente

| Variável                   | Default                           | Descrição                                        |
| -------------------------- | --------------------------------- | ------------------------------------------------ |
| `JWT_ACCESS_SECRET`        | — (obrigatória, mín. 32 chars)    | Segredo do access token                          |
| `JWT_REFRESH_SECRET`       | — (obrigatória, mín. 32 chars)    | Segredo do refresh token (consumido na Fase 1.1) |
| `JWT_ACCESS_TTL`           | `15m`                             | Validade do access token                         |
| `JWT_REFRESH_TTL`          | `30d`                             | Validade do refresh token                        |
| `MEDIA_MAX_SIZE_MB`        | `5`                               | Limite do arquivo **decodificado**               |
| `MEDIA_ALLOWED_MIME_TYPES` | `image/jpeg,image/png,image/webp` | Whitelist (CSV)                                  |
| `MEDIA_PUBLIC_BASE_URL`    | `''`                              | Prefixo das URLs retornadas; vira CDN no futuro  |
| `RATE_LIMIT_MAX`           | `100`                             | Requisições por janela (global)                  |
| `RATE_LIMIT_WINDOW`        | `1 minute`                        | Janela global                                    |
| `RATE_LIMIT_UPLOAD_MAX`    | `10`                              | Limite estrito para upload (e auth, na Fase 1.1) |
| `DB_HEALTH_DEGRADED_MS`    | `250`                             | Acima disso `/health/db` reporta `degraded`      |

Derivados em `src/config/env.ts` (calculados uma vez, não a cada upload):
`MEDIA_MAX_SIZE_BYTES`, `MEDIA_MAX_BASE64_LENGTH`, `MEDIA_BODY_LIMIT`.

## Como testar

Não há testes automatizados nesta fase (ver Pendências). A verificação abaixo foi executada
integralmente e todos os resultados conferiram.

```bash
yarn db:up
yarn db:generate && yarn build          # gera o client e compila sob strict
yarn db:migrate
docker compose exec postgres psql -U forma -d forma_db -c '\d media_assets'
yarn db:seed
yarn dev
```

**Health e envelope de erro**

```bash
curl -s localhost:3333/health            # 200 {"status":"ok",...}
curl -s localhost:3333/health/db         # 200 {"status":"ok","db":{"status":"up","latencyMs":17.8}}
docker compose stop postgres
curl -i localhost:3333/health/db         # 503, corpo sem host/senha; /health continua 200
docker compose start postgres
curl -s localhost:3333/rota-inexistente  # 404 {"error":{"code":"NOT_FOUND",...}}
```

**OpenAPI** — `curl -s localhost:3333/docs/json` expõe `3.1.0`, paths `/health`, `/health/db`,
`/media`, `/media/{id}`, tags `Health` e `Media`, e o security scheme `bearerAuth`.

**Autenticação** — sem `/auth` na Fase 0, use o minter:

```bash
TOKEN=$(yarn --silent token:dev --role=user)
ADMIN=$(yarn --silent token:dev --role=admin)
curl -i -X POST localhost:3333/media -d '{}'                        # 401 UNAUTHORIZED
curl -i -X POST localhost:3333/media -H 'authorization: Bearer lixo' # 401
```

**Upload e validação**

```bash
B64=$(base64 -i foto.png | tr -d '\n')
H=(-H "authorization: Bearer $TOKEN" -H 'content-type: application/json')

curl -s -X POST localhost:3333/media "${H[@]}" \
  -d "{\"mimeType\":\"image/png\",\"filename\":\"foto.png\",\"data\":\"$B64\"}"   # 201
# idem com prefixo "data:image/png;base64,$B64"                                   # 201

curl -s -X POST localhost:3333/media "${H[@]}" -d '{"mimeType":"image/png"}'      # 400 VALIDATION_ERROR
curl -s -X POST localhost:3333/media "${H[@]}" \
  -d '{"mimeType":"application/pdf","data":"AAAA"}'                               # 415
curl -s -X POST localhost:3333/media "${H[@]}" \
  -d '{"mimeType":"image/png","data":"!!!nao-e-base64!!!"}'                       # 400
curl -s -X POST localhost:3333/media "${H[@]}" \
  -d "{\"mimeType\":\"image/png\",\"data\":\"$(base64 -i foto.jpg|tr -d '\n')\"}" # 415 (sniffing)
```

**Limite de tamanho** — dois caminhos, ambos 413:

- ~5,24 MB decodificado (passa pelo `bodyLimit`) → `PAYLOAD_TOO_LARGE` com
  `details.receivedBytes`, rejeitado pela aritmética antes de alocar.
- ~9,3 MB de base64 → rejeitado pelo `bodyLimit`, antes do parse.

**Download, round-trip e ownership**

```bash
curl -sD- localhost:3333/media/$ID -H "authorization: Bearer $TOKEN" -o out.png
# content-type: image/png · content-length == sizeBytes · cache-control: private, immutable
cmp out.png foto.png                                              # byte-idêntico
curl -i localhost:3333/media/$ID -H "authorization: Bearer $OUTRO" # 404 (não 403)
curl -i localhost:3333/media/$ID -H "authorization: Bearer $ADMIN" # 200
curl -i localhost:3333/media/nao-e-uuid -H "..."                   # 400 Invalid UUID
```

**Rate limit** — 10 uploads passam, do 11º em diante `429 RATE_LIMITED` com `retry-after`;
60 requisições seguidas a `/health` retornam 200 (isento).

**Não-vazamento em produção**

```bash
yarn build
NODE_ENV=production PORT=3334 node dist/server.js
docker compose stop postgres && curl -s -X POST localhost:3334/media ...
# cliente: {"error":{"code":"INTERNAL_ERROR","message":"Erro interno do servidor"}}
# log do servidor: ECONNREFUSED com stack; a senha do banco não aparece em lugar nenhum
```

**Qualidade** — `yarn typecheck`, `yarn lint` e `yarn format:check` passam limpos.
`SIGTERM` produz `SIGTERM recebido, encerrando servidor...`, desconecta o Prisma e libera a porta.

## Pendências

Fora de escopo por decisão do time, a implementar em fase futura:

- **Dockerfile** de produção (multi-stage, `prisma generate`, usuário não-root).
- **CI/CD (GitHub Actions)** — lint, typecheck e build em PR. Não existe diretório `.github/`.
- **Ambiente de staging** — requer decisão de provedor (host, banco gerenciado, secrets).
- **Testes automatizados (Vitest)** — `buildApp()` já é importável sem abrir porta, então a
  infraestrutura de teste está preparada; falta o runner e os testes.

Débito técnico assumido nesta fase:

- **Resize e conversão WebP** no `MediaService` (exigiria `sharp`, dependência nativa).
- **Backend S3/R2** — a interface `MediaService` foi desenhada para a troca, mas hoje só existe
  `DbMediaStorage`. Linhas de até 5 MB em `bytea` pressionam o TOAST e os backups do Postgres.
- **FK `media_assets.owner_id → users.id`** — adicionar na Fase 1.1, junto com a tabela `users`.
- **`authenticate` não checa `status` do usuário** (`banned`/`inactive` → 403): depende de `users`.
- **`GET /media/:id` é autenticado**, o que impede `<img src="/media/...">` direto na web.
  Avaliar signed URL ou uma flag `is_public` quando houver cliente web.
- **Rate limit com store em memória** — por instância. Com escala horizontal o limite efetivo se
  multiplica; trocar por Redis.
- **`prisma.config.ts` fora do `tsconfig`** — precisou de `allowDefaultProject` no ESLint. O
  project service do typescript-eslint é instanciado uma única vez, a partir do bloco `**/*.ts`,
  então a opção precisa estar lá e não num override posterior.

### Acoplamento com o Prisma (corrigir na Fase 1)

O Prisma vaza para fora da camada de dados em três pontos. Hoje **não é possível trocar de ORM
mexendo apenas nos repositories**. Decisão consciente: deixar como está na Fase 0 e corrigir junto
com a Fase 1, antes que as features 1.1–1.5 herdem o padrão.

| Onde                                   | Vazamento                                                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `src/types/fastify.d.ts`               | `FastifyInstance.prisma: PrismaClient` põe o tipo do ORM no augmentation global — toda rota do projeto enxerga `app.prisma` |
| `src/plugins/error-handler.ts`         | `instanceof Prisma.PrismaClientKnownRequestError` e os códigos `P2002`/`P2025`/`P2003` num plugin transversal               |
| `src/features/health/health.routes.ts` | `app.prisma.$queryRaw` direto na rota: a camada HTTP fala com o ORM                                                         |

Furo adicional na abstração que já existe: `findMediaOwner` é exportado por
`shared/media/db-media-storage.ts` **fora** da interface `MediaService`, e a rota o consome direto
(violação de ISP).

Ponto que está correto e serve de referência: `DbMediaStorage` implementa `MediaService` e devolve
apenas tipos de domínio (`StoredMedia`), nunca modelos do Prisma — é substituível isoladamente.

Também é dívida do template: **nenhuma feature tem `<nome>.repository.ts`**, embora o roadmap o
exija. `health` acessa dados na rota e `media` acessa em `shared/`.

Correção pretendida (sem construir uma camada repository ORM-agnóstica, que custaria caro e
tornaria as agregações da Fase 2.4 e o ranking da 4.2 difíceis de expressar):

1. Criar `features/health/health.repository.ts` com `pingDatabase()`; a rota deixa de tocar no ORM.
2. Mover a tradução de erros do Prisma para `shared/db/map-db-error.ts`, deixando o
   `error-handler` agnóstico.
3. Remover o decorator `app.prisma` e o `PrismaClient` de `types/fastify.d.ts`.
4. Absorver `findMediaOwner` na interface `MediaService`.

Resultado esperado: trocar o ORM passa a tocar somente `shared/db/` e os `*.repository.ts`, com o
Prisma seguindo explícito dentro deles (preservando nested writes e transações).
