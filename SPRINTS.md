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
- [ ] CRUD de unidades e locais de stock
- [ ] Categorias hierárquicas
- [ ] Unidades de medida e conversões por produto
- [ ] CRUD de produtos (min/máx por local, lote/validade)
- [ ] CRUD de fornecedores e produtos por fornecedor
- [ ] Importação de produtos via Excel (carga inicial)

### Sprint 4 — Núcleo de stock
- [ ] `StockMovement` (imutável) + `StockBalance`
- [ ] Serviço de movimentos com transacção e lock
- [ ] Custo médio ponderado
- [ ] Entradas, consumos, quebras (com motivo), ajustes, estornos
- [ ] Lotes/validades e saída FEFO
- [ ] Regra de stock negativo configurável
- [ ] Ecrã de stock actual e kardex por produto
- [ ] Testes de custeio e concorrência

### Sprint 5 — Compras, transferências e inventário
- [ ] Encomendas a fornecedor
- [ ] Recepção de mercadoria (com/sem encomenda, anexo da factura)
- [ ] Transferências entre locais e unidades (PENDENTE → ENVIADA → RECEBIDA)
- [ ] Inventário: abertura, contagem (mobile-friendly), revisão de desvios, fecho com ajustes

### Sprint 6 — Fichas técnicas e importação de vendas
- [ ] Artigos de venda, fichas técnicas, sub-receitas, % perda
- [ ] Local de saída por defeito por categoria
- [ ] Custo teórico e margem por artigo
- [ ] Perfis de importação configuráveis (mapeamento de colunas)
- [ ] Upload → parse em worker → pré-visualização → confirmação
- [ ] Mapeamento artigo POS ↔ ficha técnica; pendentes com alerta
- [ ] Anti-duplicação (hash + período) e anulação de importação
- [ ] **Quando houver ficheiro Winrest:** criar perfis pré-definidos `winrest_vendas_artigo` e `winrest_pagamentos`

### Sprint 7 — Alertas e SMS
- [ ] Integração Futurix SMS (fila BullMQ, retries, `SmsLog`)
- [ ] Regras de alerta e destinatários (padrão: Admin + Gerente da unidade + Ecónomo)
- [ ] Alertas: stock mínimo, rotura, validade, stock máximo, desvio de inventário, artigos não mapeados, importação em falta
- [ ] Centro de notificações (sino) na plataforma
- [ ] Anti-spam, digest diário, horário de silêncio
- [ ] Job periódico de verificação

### Sprint 8 — Relatórios e dashboard STOCK
- [ ] Stock actual (qtd/valor), consumo, rotação, cobertura, produtos parados
- [ ] Quebras/desperdício, desvios de inventário
- [ ] Compras por fornecedor e evolução de preços
- [ ] Custo teórico das vendas e margem por artigo
- [ ] Curva ABC, comparativo entre unidades
- [ ] Sugestão de reposição → gerar encomenda
- [ ] Exportação PDF e Excel
- [ ] Dashboard principal

### Sprint 9 — Estabilização e go-live Palace (STOCK)
- [ ] Revisão de segurança e performance (índices, queries lentas)
- [ ] Deploy produção (VPS, PM2, Nginx, SSL), backups diários
- [ ] Criar tenant Palace (Lounge + Beach) pelo Super Admin
- [ ] Carga inicial: produtos, fornecedores, fichas técnicas, inventário inicial
- [ ] Formação de utilizadores
- [ ] 2 semanas de acompanhamento e correcções

---

## FASE 2 — Plano COMPLETO

### Sprint 10 — RH base
- [ ] Funcionários (documentos, IBAN encriptado, permissão `hr.sensitive`)
- [ ] Cargos e departamentos
- [ ] Escalas/turnos semanais
- [ ] Presenças, faltas, horas extra
- [ ] Férias e licenças

### Sprint 11 — Salários
- [ ] Tabela de IRT e taxas INSS configuráveis e versionadas (validar valores em vigor)
- [ ] Adiantamentos e descontos
- [ ] Processamento mensal (RASCUNHO → APROVADO → PAGO)
- [ ] Recibos PDF e mapa de salários Excel
- [ ] Testes de cálculo

### Sprint 12 — Custos diários e fecho de caixa
- [ ] Categorias de custo, custos diários, custos recorrentes
- [ ] Sessões de caixa por unidade/turno, fundo de caixa
- [ ] Valores do sistema (importação POS pagamentos ou manual) vs. contados
- [ ] Sangrias, pagamentos pela caixa
- [ ] Diferenças com justificação e alerta; validação pelo gerente

### Sprint 13 — Contas a pagar
- [ ] Geração automática a partir das recepções
- [ ] Lançamento manual, pagamentos parciais, comprovativos
- [ ] Alertas de vencimento
- [ ] Antiguidade de saldos e previsão de pagamentos

### Sprint 14 — Resultados financeiros
- [ ] Resultado diário/mensal por unidade e consolidado
- [ ] CMV %, custo de pessoal %, ticket médio, ponto de equilíbrio
- [ ] Dashboard executivo e exportações

### Sprint 15 — Analisador IA (parte 1)
- [ ] Integração Anthropic API, `AiRequest` com tokens/custo, limites por tenant
- [ ] Tools de leitura agregada (filtradas por tenant e unidades)
- [ ] Chat em linguagem natural com respostas e gráficos
- [ ] Prompts de sistema versionados

### Sprint 16 — Analisador IA (parte 2)
- [ ] Detecção de anomalias (job diário, estatística no backend + explicação IA)
- [ ] Previsão de consumo/compras
- [ ] Relatório semanal automático por unidade (PDF + notificação)
- [ ] Activação do plano COMPLETO para o Palace

---

## FASE 3 — SaaS comercial

### Sprint 17+
- [ ] Onboarding self-service de novos restaurantes
- [ ] Cobrança de subscrições (ProxyPay/Multicaixa)
- [ ] Métricas de uso para facturação (SMS, IA, unidades)
- [ ] Integração directa Winrest (API/BD), se disponível
- [ ] Conectores para outros POS
- [ ] Relógio de ponto para presenças
- [ ] 2FA, PWA para contagem de inventário offline

---

## Pendências
- [ ] Obter ficheiro de exportação Winrest (vendas por artigo + por método de pagamento)
- [ ] Validar IRT/INSS em vigor
- [ ] Definir nome comercial da plataforma
