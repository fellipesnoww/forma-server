# SDD — Software Design & Delivery

Registro de **como cada etapa do roadmap foi entregue**. Diferente do roadmap (que descreve o que
será feito), os documentos aqui descrevem decisões tomadas, estrutura criada e pendências
assumidas — sempre no passado, sempre no mesmo commit da implementação.

## Etapas documentadas

| Etapa                               | Documento                                                            | Data       |
| ----------------------------------- | -------------------------------------------------------------------- | ---------- |
| Fase 0 — Fundação técnica           | [fase-0-fundacao-tecnica.md](fase-0-fundacao-tecnica.md)             | 2026-09-06 |
| 1.1 — Autenticação                  | [1.1-autenticacao.md](1.1-autenticacao.md)                           | 2026-09-26 |
| 1.2 — Perfil do usuário             | [1.2-perfil.md](1.2-perfil.md)                                       | 2026-09-26 |
| 1.3 — Exercícios                    | [1.3-exercicios.md](1.3-exercicios.md)                               | 2026-09-26 |
| 1.4 — Planilha de treino            | [1.4-planilhas.md](1.4-planilhas.md)                                 | 2026-09-26 |
| 1.5 — Execução de treino            | [1.5-sessoes-treino.md](1.5-sessoes-treino.md)                       | 2026-10-03 |
| 1.6 — Entrega Fase 1                | [1.6-entrega-fase-1.md](1.6-entrega-fase-1.md)                       | 2026-10-03 |
| 2.1 — Atividades livres             | [2.1-atividades-livres.md](2.1-atividades-livres.md)                 | 2026-10-03 |
| 2.2 — Calendário                    | [2.2-calendario.md](2.2-calendario.md)                               | 2026-10-03 |
| 2.3 — Registro retroativo           | [2.3-registro-retroativo.md](2.3-registro-retroativo.md)             | 2026-10-03 |
| 2.4 — Progressão                    | [2.4-progressao.md](2.4-progressao.md)                               | 2026-10-03 |
| 3.1 — Infra admin                   | [3.1-infra-admin.md](3.1-infra-admin.md)                             | 2026-10-04 |
| 3.2 — Gestão de exercícios (admin)  | [3.2-admin-exercicios.md](3.2-admin-exercicios.md)                   | 2026-10-04 |
| 3.3 — Gestão de usuários (admin)    | [3.3-admin-usuarios.md](3.3-admin-usuarios.md)                       | 2026-10-04 |
| 3.4 — Gestão de administradores     | [3.4-admin-super-user.md](3.4-admin-super-user.md)                   | 2026-10-04 |
| 3.5 — Conquistas e desafios (admin) | [3.5-admin-conquistas-desafios.md](3.5-admin-conquistas-desafios.md) | 2026-10-04 |
| 3.6 — Entrega Fase 3                | [3.6-entrega-fase-3.md](3.6-entrega-fase-3.md)                       | 2026-10-04 |

## Como criar um novo documento

1. Copie [`_template.md`](_template.md) para `sdd/<prefixo>-<slug>.md`, usando o mesmo prefixo
   numérico do roadmap (`1.1-autenticacao.md`, `fase-0-fundacao-tecnica.md`).
2. Preencha as 9 seções obrigatórias (escopo, decisões, estrutura, APIs, modelo de dados,
   variáveis de ambiente, como testar, pendências).
3. Adicione a linha correspondente na tabela acima.
4. Commit junto com a implementação — não em um PR separado.

Referência: [roadmap-backend.md](../roadmap-backend.md) › Documentação SDD.
