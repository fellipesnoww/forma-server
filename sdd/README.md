# SDD — Software Design & Delivery

Registro de **como cada etapa do roadmap foi entregue**. Diferente do roadmap (que descreve o que
será feito), os documentos aqui descrevem decisões tomadas, estrutura criada e pendências
assumidas — sempre no passado, sempre no mesmo commit da implementação.

## Etapas documentadas

| Etapa                     | Documento                                                | Data       |
| ------------------------- | -------------------------------------------------------- | ---------- |
| Fase 0 — Fundação técnica | [fase-0-fundacao-tecnica.md](fase-0-fundacao-tecnica.md) | 2026-09-06 |
| 1.1 — Autenticação        | [1.1-autenticacao.md](1.1-autenticacao.md)               | 2026-09-26 |
| 1.2 — Perfil do usuário   | [1.2-perfil.md](1.2-perfil.md)                           | 2026-09-26 |

## Como criar um novo documento

1. Copie [`_template.md`](_template.md) para `sdd/<prefixo>-<slug>.md`, usando o mesmo prefixo
   numérico do roadmap (`1.1-autenticacao.md`, `fase-0-fundacao-tecnica.md`).
2. Preencha as 9 seções obrigatórias (escopo, decisões, estrutura, APIs, modelo de dados,
   variáveis de ambiente, como testar, pendências).
3. Adicione a linha correspondente na tabela acima.
4. Commit junto com a implementação — não em um PR separado.

Referência: [roadmap-backend.md](../roadmap-backend.md) › Documentação SDD.
