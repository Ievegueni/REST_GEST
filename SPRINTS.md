# SPRINTS.md — RestoGest

Plano de desenvolvimento faseado. Sprints de ~1 semana (ajustar ao ritmo real).
Marcar `[x]` ao concluir. Cada sprint termina com testes a passar e deploy em staging.

- **Fase 1 (Sprints 0–9):** plano STOCK pronto para produção → entrega ao grupo Palace.
- **Fase 2 (Sprints 10–16):** plano COMPLETO.
- **Fase 3 (Sprint 17+):** SaaS comercial e integrações.

---

## FASE 1 — Plano STOCK

### Sprint 0 — Fundações
- [x] Monorepo (`apps/api`, `apps/web`, `packages/shared`), TypeScript strict, ESLint/Prettier
- [x] docker-compose (PostgreSQL + Redis) para dev
- [x] Fastify base: pino, helmet, cors, rate-limit, tratamento de erros padrão
- [x] Prisma configurado; modelos `Tenant`, `Unit`, `StockLocation`, `User`, `Role`, `Permission`, `UserUnit`, `AuditLog`
- [x] Extensão Prisma de isolamento por `tenantId`
- [x] React + Vite + Tailwind; layout base (sidebar, topbar, selector de unidade)
- [x] Vitest configurado (API e web)
- [x] Seed de tenant de demonstração genérico

### Sprint 1 — Auth, perfis e feature flags
- [x] Login, JWT + refresh token, logout, recuperação de senha (entrega do link por SMS no Sprint 7; em dev vai para o log)
- [x] Perfis base e permissões `modulo.accao`; `requirePermission`
- [x] Acesso de utilizadores por unidade
- [x] Mapa de features por plano (`packages/shared/features.ts`)
- [x] `requireFeature` (API), `<FeatureGate>` e `useFeature` (web)
- [x] Página Definições → Plano (só leitura no tenant)
- [x] Testes de isolamento de tenant e de bloqueio por feature

### Sprint 2 — Super Admin
- [x] Área `/admin` separada
- [x] CRUD de tenants, suspensão
- [x] **Selector de plano STOCK/COMPLETO + overrides de features**
- [x] Limites por tenant (unidades, utilizadores, SMS, IA) — `assertWithinLimit` pronto; aplicar em Sprint 3 (unidades/utilizadores), 7 (SMS) e 15 (IA)
- [x] Criação do primeiro admin do tenant
- [x] Impersonation com auditoria

### Sprint 3 — Estrutura e catálogo
- [x] CRUD de unidades e locais de stock
- [x] Categorias hierárquicas
- [x] Unidades de medida e conversões por produto
- [x] CRUD de produtos (min/máx por local, lote/validade)
- [x] CRUD de fornecedores e produtos por fornecedor
- [x] Importação de produtos via Excel (carga inicial)
- [x] Gestão de utilizadores (perfil, acesso por unidade, limite do plano) — não estava planeada
- [ ] Perfis personalizados (o tenant criar/editar perfis) — por fazer

### Sprint 4 — Núcleo de stock
- [x] `StockMovement` (imutável) + `StockBalance`
- [x] Serviço de movimentos com transacção e lock
- [x] Custo médio ponderado
- [x] Entradas, consumos, quebras (com motivo), ajustes, estornos
- [x] Motivos de quebra como lista configurável (Sprint 8)
- [x] Lotes/validades e saída FEFO
- [x] Regra de stock negativo configurável
- [x] Ecrã de stock actual e kardex por produto
- [x] Testes de custeio e concorrência

### Sprint 5 — Compras, transferências e inventário
- [x] Encomendas a fornecedor
- [x] Recepção de mercadoria (com/sem encomenda, anexo da factura)
- [x] Transferências entre locais e unidades (PENDENTE → ENVIADA → RECEBIDA)
- [x] Inventário: abertura, contagem (mobile-friendly), revisão de desvios, fecho com ajustes
- [ ] Transferir para unidades a que o utilizador não tem acesso (hoje o destino limita-se às unidades acessíveis)

### Sprint 6 — Fichas técnicas e importação de vendas
- [x] Artigos de venda, fichas técnicas, sub-receitas, % perda
- [x] Local de saída por defeito por categoria
- [x] Custo teórico e margem por artigo
- [x] Perfis de importação configuráveis (mapeamento de colunas)
- [x] Upload → parse em worker → pré-visualização → confirmação
- [x] Mapeamento artigo POS ↔ ficha técnica; pendentes com alerta
- [x] Anti-duplicação (hash + período) e anulação de importação
- [ ] **Quando houver ficheiro Winrest:** criar perfis pré-definidos `winrest_vendas_artigo` e `winrest_pagamentos`

### Sprint 7 — Alertas e SMS
- [x] Integração Futurix SMS (fila BullMQ, retries, `SmsLog`) — formato do pedido assumido; falta testar com credenciais/documentação reais
- [x] Regras de alerta e destinatários (padrão: Admin + Gerente da unidade + Ecónomo)
- [x] Alertas: stock mínimo, rotura, validade, stock máximo, desvio de inventário, artigos não mapeados, importação em falta
- [x] Centro de notificações (sino) na plataforma
- [x] Anti-spam, digest diário, horário de silêncio
- [x] Job periódico de verificação
- [ ] Regras de alerta por unidade (hoje por tipo; destinatários filtrados pelo acesso à unidade)

### Sprint 8 — Relatórios e dashboard STOCK
- [x] Stock actual (qtd/valor), consumo, rotação, cobertura, produtos parados
- [x] Quebras/desperdício, desvios de inventário
- [x] Compras por fornecedor e evolução de preços
- [x] Custo teórico das vendas e margem por artigo
- [x] Curva ABC, comparativo entre unidades
- [x] Sugestão de reposição → gerar encomenda
- [x] Exportação PDF e Excel
- [x] Dashboard principal

### Sprint 9 — Estabilização e go-live Palace (STOCK)
- [x] Revisão de segurança e performance (`trustProxy` atrás do Nginx, API só em 127.0.0.1, índice de movimentos por período; login já limitado a 10/min)
- [x] Ficheiros de deploy: PM2 (API + worker separados), Nginx, backup diário com retenção 30 dias e cópia remota (`deploy/`)
- [ ] Deploy na VPS real, SSL e cron de backups (precisa de acesso à VPS e domínio)
- [ ] Criar tenant Palace (Lounge + Beach) pelo Super Admin
- [ ] Carga inicial: produtos, fornecedores, fichas técnicas, inventário inicial
- [ ] Formação de utilizadores
- [ ] 2 semanas de acompanhamento e correcções

---

## FASE 2 — Plano COMPLETO

### Sprint 10 — RH base
- [x] Funcionários (documentos, IBAN encriptado, permissão `hr.sensitive`)
- [x] Cargos e departamentos
- [x] Escalas/turnos semanais
- [x] Presenças, faltas, horas extra
- [x] Férias e licenças

### Sprint 11 — Salários
- [x] Tabela de IRT e taxas INSS configuráveis e versionadas (Super Admin) — **valores reais por introduzir e validar**
- [x] Adiantamentos e descontos
- [x] Processamento mensal (RASCUNHO → APROVADO → PAGO)
- [x] Recibos PDF e mapa de salários Excel
- [x] Testes de cálculo

### Sprint 12 — Custos diários e fecho de caixa
- [x] Categorias de custo, custos diários, custos recorrentes
- [x] Sessões de caixa por unidade/turno, fundo de caixa
- [x] Valores do sistema (manual) vs. contados
- [ ] Importação dos pagamentos do POS (perfil `winrest_pagamentos`) — quando houver ficheiro Winrest
- [x] Sangrias, pagamentos pela caixa
- [x] Diferenças com justificação e alerta; validação pelo gerente

### Sprint 13 — Contas a pagar
- [x] Geração automática a partir das recepções
- [x] Lançamento manual, pagamentos parciais, comprovativos
- [x] Alertas de vencimento
- [x] Antiguidade de saldos e previsão de pagamentos

### Sprint 14 — Resultados financeiros
- [x] Resultado diário/mensal por unidade e consolidado
- [x] CMV %, custo de pessoal %, ponto de equilíbrio
- [ ] Ticket médio — quando o ficheiro do POS trouxer o nº de documentos
- [x] Dashboard executivo e exportações

### Sprint 15 — Analisador IA (parte 1)
- [x] Integração Anthropic API, `AiRequest` com tokens/custo, limites por tenant (+ uso do mês no Super Admin)
- [x] Tools de leitura agregada (filtradas por tenant, unidades, plano e permissões)
- [x] Chat em linguagem natural com respostas e gráficos
- [x] Prompts de sistema versionados (`modules/ai/prompts.ts`)
- [ ] Testar com chave real da Anthropic (`ANTHROPIC_API_KEY`)

### Sprint 16 — Analisador IA (parte 2)
- [x] Detecção de anomalias (job diário 06:30, z-score vs. 28 dias no backend + explicação IA; alerta `AI_ANOMALY` com limiar configurável)
- [x] Previsão de consumo/compras (ferramenta `get_consumption_forecast` no chat, média ponderada por dia da semana)
- [x] Relatório semanal automático por unidade (segunda 07:00; PDF + notificação)
- [ ] SMS resumido do relatório semanal (opcional — não feito)
- [ ] Activação do plano COMPLETO para o Palace (tarefa do Super Admin)

---

## FASE 3 — SaaS comercial

### Sprint 17+
- [ ] Onboarding self-service de novos restaurantes
- [ ] Cobrança de subscrições (ProxyPay/Multicaixa)
- [x] Métricas de uso para facturação (SMS, IA, importações — Super Admin, mês corrente)
- [ ] Integração directa Winrest (API/BD), se disponível
- [ ] Conectores para outros POS
- [ ] Relógio de ponto para presenças
- [ ] 2FA, PWA para contagem de inventário offline

---

## Pendências
- [ ] Obter ficheiro de exportação Winrest (vendas por artigo + por método de pagamento)
- [ ] Validar IRT/INSS em vigor
- [ ] Definir nome comercial da plataforma
