# Roadmap de Features — Forma

> Features organizadas por fases, da mais crítica à mais avançada. Cada fase representa um ciclo de desenvolvimento com entregável funcional e testável.

---

## Fase 1 — Fundação (MVP Core)
> **Objetivo:** ter um app funcional que um usuário consiga usar do zero para registrar treinos.
> **Estimativa:** 6 a 8 semanas

### Autenticação e onboarding
- [ ] Login com Google (OAuth)
- [ ] Login com Apple (OAuth)
- [ ] Criação automática de perfil pós-login
- [ ] Tela de onboarding (apresentação das funcionalidades principais)

### Perfil do usuário
- [ ] Cadastro de dados físicos: peso, altura, cintura e peitoral
- [ ] Edição de perfil e foto de avatar
- [ ] Histórico de medidas com data de registro

### Exercícios
- [ ] Biblioteca de exercícios padrão (mínimo 80 exercícios categorizados por grupo muscular)
- [ ] Criação de exercício personalizado pelo usuário
- [ ] Edição e exclusão de exercício personalizado

### Planilha de treino
- [ ] Criação de planilha com nome e seleção de dias da semana
- [ ] Adição de exercícios por dia com ordem personalizada
- [ ] Edição e exclusão de planilha
- [ ] Listagem de planilhas criadas

### Execução de treino
- [ ] Tela de execução com séries, repetições e carga por exercício
- [ ] Finalização de treino com foto e comentário opcionais
- [ ] Registro de data e hora da sessão

### Infraestrutura e sistema de roles
- [ ] Modelagem de banco de dados com suporte a roles (super user, admin, usuário)
- [ ] Sistema de autenticação e autorização por nível de acesso
- [ ] Upload e compressão automática de imagens
- [ ] Ambiente de staging configurado

---

## Fase 2 — Completude do usuário
> **Objetivo:** cobrir todos os casos de uso do usuário geral, tornando o app completo para o dia a dia.
> **Estimativa:** 4 a 6 semanas

### Atividades livres
- [ ] Registro de atividade customizável (natação, futebol, corrida, atletismo etc.)
- [ ] Campos: tipo de atividade, duração, comentário e foto
- [ ] Criação de tipos de atividade personalizados pelo usuário

### Calendário
- [ ] Calendário mensal com indicação visual de dias com treino ou atividade
- [ ] Miniaturas das fotos postadas nos dias do calendário
- [ ] Visualização detalhada do dia ao clicar na data

### Registro retroativo
- [ ] Lançamento de treino em data passada via calendário
- [ ] Lançamento de atividade livre em data passada via calendário
- [ ] Validação para não permitir datas futuras

### Gráficos de progressão
- [ ] Gráfico de evolução de carga por exercício ao longo do tempo
- [ ] Gráfico de evolução de medidas corporais (peso, cintura, peitoral)
- [ ] Filtros por período (30, 60, 90 dias e personalizado)

---

## Fase 3 — Painel administrativo
> **Objetivo:** dar aos administradores controle total sobre conteúdo e usuários da plataforma.
> **Estimativa:** 3 a 4 semanas

### Gestão de exercícios (admin)
- [ ] Cadastro de novos tipos de exercício com nome, grupo muscular, descrição e imagem/GIF
- [ ] Edição e desativação de exercícios da biblioteca padrão
- [ ] Organização por categoria e grupo muscular

### Gestão de usuários (admin)
- [ ] Listagem de todos os usuários cadastrados com filtros e busca
- [ ] Visualização do perfil individual do usuário
- [ ] Ativação, desativação e banimento de usuários
- [ ] Promoção de usuário para administrador

### Gestão de administradores (super user)
- [ ] Listagem de todos os administradores
- [ ] Promoção de administrador para super user
- [ ] Revogação de permissões de administrador
- [ ] Log de ações administrativas (auditoria)

### Conquistas e desafios (admin)
- [ ] Cadastro de conquistas com nome, descrição, ícone e critério de desbloqueio
- [ ] Cadastro de desafios com nome, descrição, período, meta e recompensa
- [ ] Ativação e desativação de desafios
- [ ] Visualização de quais usuários desbloquearam cada conquista

---

## Fase 4 — Engajamento e gamificação
> **Objetivo:** aumentar retenção e motivação com mecânicas de gamificação e feedback ao usuário.
> **Estimativa:** 3 a 4 semanas

### Conquistas
- [ ] Exibição de conquistas desbloqueadas no perfil do usuário
- [ ] Notificação in-app ao desbloquear nova conquista
- [ ] Vitrine de todas as conquistas disponíveis (desbloqueadas e bloqueadas)

### Desafios
- [ ] Listagem de desafios ativos com prazo e meta
- [ ] Participação e acompanhamento de progresso no desafio
- [ ] Ranking de participantes por desafio
- [ ] Histórico de desafios concluídos

### Streaks e consistência
- [ ] Contador de dias consecutivos com atividade registrada
- [ ] Indicador visual de streak no perfil e no calendário
- [ ] Conquista automática por marcos de streak (7, 30, 60, 90 dias)

---

## Fase 5 — Experiência avançada
> **Objetivo:** polir a experiência do usuário e adicionar funcionalidades de produtividade dentro do treino.
> **Estimativa:** 3 a 5 semanas

### Qualidade de vida no treino
- [ ] Cronômetro de descanso entre séries (configurável por exercício)
- [ ] Sugestão automática de carga com base no histórico da última sessão
- [ ] Reordenação de exercícios por drag and drop na planilha
- [ ] Duplicação de planilha existente

### Notificações
- [ ] Notificação push para lembrar de treinar nos dias configurados
- [ ] Notificação de conquista desbloqueada
- [ ] Notificação de novo desafio disponível
- [ ] Configuração de horário e frequência de lembretes pelo usuário

### Modo escuro
- [ ] Tema escuro completo para mobile e web
- [ ] Detecção automática do tema do sistema operacional

---

## Fase 6 — Integrações e expansão
> **Objetivo:** conectar o app ao ecossistema de saúde e permitir exportação e compartilhamento de dados.
> **Estimativa:** 4 a 6 semanas

### Integrações de saúde
- [ ] Integração com Apple Health (leitura e escrita de dados de atividade)
- [ ] Integração com Google Fit (leitura e escrita de dados de atividade)
- [ ] Sincronização de peso registrado no app com os apps de saúde nativos

### Exportação e compartilhamento
- [ ] Exportação do histórico de treinos em PDF
- [ ] Exportação de dados em CSV para análise externa
- [ ] Compartilhamento de treino concluído em redes sociais (card visual gerado automaticamente)
- [ ] Compartilhamento de gráfico de progressão como imagem

### Modo offline *(complexidade alta)*
- [ ] Cache local de planilhas e exercícios para uso sem internet
- [ ] Sincronização automática ao retomar conexão
- [ ] Indicador de status de sincronização na interface

---

## Resumo do roadmap

| Fase | Foco | Prioridade | Estimativa |
|---|---|---|---|
| Fase 1 | MVP Core — treino funcional do zero | 🔴 Crítica | 6–8 semanas |
| Fase 2 | Completude do usuário geral | 🔴 Crítica | 4–6 semanas |
| Fase 3 | Painel administrativo completo | 🟠 Alta | 3–4 semanas |
| Fase 4 | Gamificação e engajamento | 🟠 Alta | 3–4 semanas |
| Fase 5 | Experiência avançada e notificações | 🟡 Média | 3–5 semanas |
| Fase 6 | Integrações e exportação | 🟢 Futura | 4–6 semanas |

> **Total estimado:** 23 a 33 semanas (~6 a 8 meses) dependendo do tamanho do time.
