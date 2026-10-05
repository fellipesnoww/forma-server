# Ajustes para o design web (dashboard, calendário, admin)

> Roadmap: fora das etapas numeradas — lacunas encontradas ao comparar o design
> `Forma Web.dc.html` com a API (itens 5, 11, 12, 15, 16 e 18 da análise)
> Data: 2026-10-04
>
> Pequenas extensões de features existentes (auth, sessões, admin) e uma feature nova somente
> leitura (`stats`) para a tela inicial.

## Escopo entregue

- [x] `createdAt` no objeto `user` de todas as respostas de `/auth/*` e `/auth/me` ("membro desde")
- [x] `lastActivityAt` no resumo de usuário do admin (listagens e respostas de status/papel) — coluna "último treino"
- [x] `GET /admin/audit-logs/export` — CSV do audit log com os filtros da listagem (super_user)
- [x] `durationMinutes` em sessões: informado no POST/PATCH ou calculado no `complete`
- [x] `exerciseCount`, `setCount` e `durationMinutes` no resumo de sessão (listagem e detalhe do dia do calendário)
- [x] `GET /stats/overview` — números do dashboard (volume da semana, treinos do mês vs. plano, atividades)
- [x] `src/shared/csv` — serialização CSV reutilizável (Fase 6.2)
- [x] Documentação OpenAPI (tag nova `Estatisticas`; rotas existentes atualizadas)
- [x] Testes automatizados — `test/stats.test.ts`, `test/csv.test.ts` e casos novos em `workout-sessions`, `calendar`, `admin-users`, `smoke`

## Decisões técnicas

- **Duração da sessão**: coluna `duration_minutes` (1–1440, mesmo teto das atividades livres). O registro retroativo informa o valor; numa sessão ao vivo o `complete` calcula `completedAt − performedAt` (mínimo 1 min). Fora de (0, 24h] — retroativo finalizado dias depois — o valor fica `null` em vez de inventar uma duração. Valor informado pelo client nunca é sobrescrito; `PATCH { durationMinutes: null }` remove.
- **Contagens no resumo de sessão** via `_count` das séries por exercício: a listagem e o calendário mostram "7 exercícios · 26 séries" sem carregar todas as séries. Vale para `GET /workout-sessions` também (mudança aditiva).
- **`lastActivityAt` no resumo admin**: mesma semântica de `stats.lastActivityAt` do detalhe (sessões + atividades livres), calculado numa query por página. O design chama a coluna de "último treino"; preferimos não criar um segundo conceito só com sessões.
- **Export do audit log**: CSV montado em memória, limitado a 10.000 linhas (mais recentes primeiro). Headers `X-Total-Count` e `X-Export-Truncated` informam o corte; o painel filtra por período para exportar o resto. Sem paginação (`page`/`limit` são ignorados). Expostos via CORS junto com `Content-Disposition`.
- **CSV**: RFC 4180 (CRLF, aspas duplicadas), BOM UTF-8 para o Excel abrir acentos, e células de texto começando com `= + - @` ganham `'` na frente (CSV injection — email e metadata vêm de usuários). Números negativos não são alterados.
- **Dashboard**: "semana" = últimos 7 dias incluindo hoje (o gráfico de 7 barras), comparada com os 7 dias anteriores; "mês" = mês corrente, tudo no fuso do perfil. Volume conta todas as séries, como a progressão (2.4). `plannedWorkoutCount` aplica as planilhas **ativas hoje** ao mês inteiro (não há histórico de edição de planilha); um weekday usado por duas planilhas conta duas vezes. Percentuais `null` quando o denominador é 0.

## Estrutura criada

```
src/features/stats/                (index, routes, service, repository, schemas)
src/shared/csv/                    (csv.ts, index.ts)
src/features/admin/audit/          (alterada: export)
src/features/admin/users/          (alterada: lastActivityAt)
src/features/workout-sessions/     (alterada: duração e contagens)
src/features/auth/                 (alterada: createdAt)
prisma/migrations/20261004224753_add_session_duration/
test/stats.test.ts
test/csv.test.ts
```

## APIs

| Método | Rota                                                        | Descrição                                                                                                                     |
| ------ | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/stats/overview`                                           | `{ timezone, today, week: { from, to, volumeKg, previousVolumeKg, volumeChangePct, workoutCount, days[7] }, month: { ... } }` |
| GET    | `/admin/audit-logs/export`                                  | CSV (`text/csv`), mesmos filtros de `/admin/audit-logs`; super_user                                                           |
| —      | `/auth/*`, `/auth/me`                                       | `user.createdAt`                                                                                                              |
| —      | `/admin/users`, `/admin/admins` e respostas de status/papel | `lastActivityAt`                                                                                                              |
| —      | `/workout-sessions*`, `/calendar/{date}`                    | `durationMinutes`, `exerciseCount`, `setCount` no resumo; `durationMinutes` aceito no POST/PATCH                              |

## Modelo de dados

**`workout_sessions`** (alterada): coluna `duration_minutes INTEGER NULL`.

## Variáveis de ambiente

Nenhuma nova.

## Como testar

```bash
curl -s localhost:3333/stats/overview -H "authorization: Bearer $ACCESS"
curl -s -X POST localhost:3333/workout-sessions -H "authorization: Bearer $ACCESS" \
  -H 'content-type: application/json' \
  -d '{"sheetId":"<id>","performedAt":"2026-10-01T18:30:00-03:00","durationMinutes":55,"exercises":[...]}'
curl -s -OJ "localhost:3333/admin/audit-logs/export?from=2026-10-01T00:00:00Z" -H "authorization: Bearer $SUPER"
```

## Pendências

- Export do audit log não faz streaming: acima de 10.000 linhas o arquivo é cortado (sinalizado nos headers).
- Meta do mês usa as planilhas atuais para o mês inteiro; um histórico de planilhas resolveria.
- Demais lacunas da análise do design (reset de senha, termos, onboarding, categoria/descrição de exercícios, GIF, etc.) seguem em aberto.
