# Escopo de Negócio — App de Gerenciamento de Treinos e Atividades Físicas

---

## 1. Visão geral do produto

**Forma** é uma plataforma mobile e web para gerenciamento completo de treinos e atividades físicas, com sistema de perfis hierárquicos (usuário, administrador e super user), gamificação via conquistas e desafios, e acompanhamento detalhado de evolução física e de desempenho.

**Missão:** ajudar qualquer pessoa a treinar com mais consistência, clareza e motivação — independentemente de ter ou não um personal trainer.

**Visão:** tornar-se a plataforma de referência em português para acompanhamento de evolução física, unindo dados de treino, composição corporal e engajamento comunitário em uma experiência simples e motivadora.

---

## 2. Problema e oportunidade

**O problema central:** praticantes de atividade física não têm uma ferramenta única, em português, que combine registro de treino com musculação, atividades livres (natação, futebol, corrida), acompanhamento corporal e progressão visual. O resultado é dispersão: cadernos, planilhas, printscreens e apps em inglês que não se falam.

**Problemas específicos identificados:**

- Falta de histórico acessível no momento do treino
- Impossibilidade de registrar atividades retroativas quando se esquece de anotar
- Ausência de acompanhamento de medidas corporais integrado ao app de treino
- Sem mecanismo de motivação contínua (conquistas, desafios)
- Gestão de conteúdo (exercícios, desafios) centralizada em planilhas ou sistemas externos

**A oportunidade:** o mercado global de fitness apps supera US$ 15 bilhões e cresce 17% ao ano. No Brasil, com mais de 33 mil academias ativas e forte cultura de treino em casa pós-pandemia, há um público amplo e subatendido por soluções nativas em português com profundidade real de funcionalidade.

---

## 3. Público-alvo e personas

**Segmentação primária:** homens e mulheres entre 18 e 45 anos que praticam musculação, esportes ou atividades físicas regulares, com ou sem acompanhamento profissional.

### Persona 1 — O autônomo consistente
Lucas, 27 anos. Treina musculação 4x por semana sem personal. Monta seus próprios treinos, mas perde o histórico de cargas. Quer saber se está progredindo de verdade e se motivar a não faltar.
**Dor:** sem visibilidade de evolução e sem estrutura para manter consistência.

### Persona 2 — O praticante múltiplo
Camila, 34 anos. Faz musculação 3x e nada 2x por semana. Quer registrar tudo em um só lugar mas nenhum app atual contempla musculação e atividades livres juntas.
**Dor:** fragmentação de dados em vários apps ou anotações.

### Persona 3 — O iniciante que precisa de estrutura
Rafael, 22 anos. Começou a treinar há 2 meses. Não sabe montar treino, precisa de exercícios pré-cadastrados e quer sentir que está evoluindo para não desistir.
**Dor:** falta de referência e de feedback visual sobre o próprio progresso.

### Persona 4 — O administrador da plataforma
Thiago, 38 anos, gestor de comunidade fitness. Precisa de um painel para gerenciar usuários, criar desafios temáticos e garantir que o catálogo de exercícios esteja atualizado e correto.
**Dor:** não ter controle centralizado e auditável da plataforma.

---

## 4. Proposta de valor

| Diferencial | Detalhe |
|---|---|
| Tudo em um lugar | Musculação, atividades livres, medidas corporais e progressão no mesmo app |
| Registro retroativo | Calendário permite lançar treinos e atividades de dias anteriores |
| Acompanhamento corporal | Registro de peso, altura, cintura e peitoral com histórico e evolução |
| Gamificação real | Conquistas e desafios criados por admins mantêm o usuário engajado |
| Português nativo | Interface 100% em pt-BR, terminologia familiar ao brasileiro |
| Login sem atrito | Autenticação via Google e Apple — zero cadastro manual |
| Gestão escalável | Hierarquia de usuários (super user → admin → usuário) para crescimento da plataforma |

---

## 5. Funcionalidades do MVP

### Must Have

**Autenticação e perfil**
- Login via Google e Apple (OAuth)
- Perfil do usuário com registro de peso, altura, cintura e peitoral
- Histórico de medidas corporais com evolução ao longo do tempo

**Treinos e planilhas**
- Criação de planilha de treino com seleção de dias da semana e exercícios por dia
- Biblioteca de exercícios padrão cadastrados pelo administrador
- Criação de exercício personalizado pelo próprio usuário
- Tela de execução de treino: registro de séries, repetições e carga por exercício
- Registro de finalização: foto e comentário ao concluir o treino

**Atividades livres**
- Registro de atividade customizável (natação, futebol, corrida, atletismo etc.)
- Campo para duração, comentário e foto da atividade

**Calendário e histórico**
- Calendário mensal com indicação visual dos dias com treino ou atividade registrada
- Miniaturas das fotos postadas no calendário
- Registro retroativo: lançamento de treino ou atividade em datas passadas

**Progressão**
- Gráfico de evolução de carga por exercício ao longo do tempo
- Gráfico de evolução de medidas corporais (peso, cintura, peitoral)

**Conquistas e desafios**
- Exibição de conquistas desbloqueadas pelo usuário
- Visualização e participação em desafios ativos

**Painel administrativo**
- Administrador: cadastro e edição de tipos de exercício, criação de desafios e conquistas, visualização e gerenciamento de usuários
- Super user: todas as permissões do administrador + promoção e gestão de administradores e outros super users

### Nice to Have

- Cronômetro de descanso entre séries
- Sugestão automática de carga com base no histórico da última sessão
- Compartilhamento de treino concluído nas redes sociais
- Modo escuro
- Exportação do histórico em PDF ou CSV
- Integração com Apple Health e Google Fit
- Notificações push para lembrar de treinar
- Streaks de dias consecutivos com atividade registrada

---

## 6. Métricas de sucesso

**Aquisição**
- 1.000 usuários cadastrados no primeiro mês após lançamento
- Taxa de conversão de visitante para cadastro acima de 25%

**Ativação**
- 60% dos novos usuários criam ao menos uma planilha de treino na primeira semana
- 70% completam o perfil com ao menos uma medida corporal

**Retenção**
- Retenção D7 acima de 50% e D30 acima de 35%
- DAU/MAU acima de 30%

**Engajamento**
- Média de 3+ treinos ou atividades registrados por semana por usuário ativo
- 40% dos treinos finalizados com foto ou comentário
- 20% dos usuários participam ativamente de ao menos um desafio por mês

**Plataforma**
- Tempo médio de resposta do painel admin abaixo de 2 segundos
- Zero incidentes de escalada indevida de permissão

---

## 7. Riscos e premissas

### Riscos técnicos

- **Armazenamento de fotos em escala** pode gerar custo elevado de infraestrutura — mitigar com compressão automática e limite de armazenamento por usuário
- **Sistema de permissões hierárquicas** exige modelagem robusta de roles desde o início — falha aqui gera vulnerabilidades graves
- **Registro retroativo** aumenta a complexidade do modelo de dados de sessões — precisa suportar timestamps arbitrários desde o MVP
- **Modo offline** é complexo — premissa: MVP requer conexão, offline fica para v2

### Riscos de mercado

- Apps como Hevy e Strong já possuem versão em português — diferenciação via UX, atividades livres integradas e gamificação será o principal vetor
- Usuários de fitness são resistentes a pagar por apps — modelo freemium com limites no plano gratuito deve ser considerado para monetização futura

### Riscos de negócio

- Dependência das políticas e taxas da App Store e Play Store
- Custo de aquisição de usuário pode ser alto sem estratégia de crescimento orgânico
- Gestão de conteúdo depende de admins ativos — plataforma lançada com conteúdo insuficiente gera abandono precoce

### Premissas assumidas

- O usuário possui smartphone iOS ou Android com acesso à internet
- O time conta com ao menos 1 desenvolvedor mobile, 1 desenvolvedor backend e 1 designer
- O MVP não contempla personal trainers gerenciando alunos — foco exclusivo no usuário autônomo
- Haverá ao menos 1 super user e 2 administradores configurados antes do lançamento

---

## 8. Próximos passos

**Semana 1**
- Definir e registrar nome do produto e domínio
- Fechar stack tecnológica (sugestão: React Native, Next.js, Node.js + PostgreSQL, Supabase)
- Modelar banco de dados com foco no sistema de roles e sessões com timestamps retroativos
- Criar wireframes das telas principais

**Semana 2**
- Validar wireframes com 5 a 8 usuários reais
- Iniciar desenvolvimento do backend: autenticação OAuth, roles, CRUD de exercícios
- Montar biblioteca inicial com 80 a 100 exercícios padrão categorizados

**Semana 3**
- Desenvolver tela de criação e execução de planilha de treino
- Implementar registro de atividades livres e upload de foto com compressão
- Desenvolver painel administrativo
- Configurar ambiente de staging

**Semana 4**
- Desenvolver calendário com registro retroativo e gráficos de progressão
- Implementar sistema de conquistas e desafios
- Testes funcionais end-to-end com foco em permissões e integridade de dados
- Lançar beta fechado para 20 a 30 usuários convidados e coletar feedback
