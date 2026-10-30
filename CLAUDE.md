# CLAUDE.md — RestoGest (nome provisório)

Plataforma SaaS multi-tenant de gestão de restaurantes, desenvolvida pela **COMUNICA, LDA**.
Primeiro cliente: grupo **Palace** (unidades **Palace Lounge** e **Palace Beach**).
A plataforma é **genérica**: nenhum dado, regra ou texto do cliente Palace pode estar fixo no código.

---

## 1. Visão geral

- Um único projecto, uma única base de código.
- Cada cliente (tenant) tem um **plano** que define as funcionalidades activas:
  - **STOCK** — controlo de stock, alertas, relatórios e análises.
  - **COMPLETO** — tudo do STOCK + RH, custos diários, fecho de caixa, contas a pagar, resultados e **Analisador IA**.
- A troca de plano é feita por um **botão/selector** no painel (ver §5). Não há código duplicado entre versões.
- Um tenant pode ter várias **unidades** (estabelecimentos) com visão individual ou consolidada.

## 2. Stack (padrão COMUNICA)

| Camada | Tecnologia |
|---|---|
| Backend | Node.js 20 + Fastify (TypeScript) |
| ORM / BD | Prisma + PostgreSQL |
| Filas / jobs | BullMQ + Redis |
| Frontend | React 18 + Vite + Tailwind (TypeScript) |
| SMS | Futurix SMS API |
| Ficheiros | Cloudinary (anexos, documentos RH, comprovativos) |
| IA | Anthropic API (Claude) com tool use |
| Excel | `exceljs` (import/export) |
| PDF | `pdfmake` ou Puppeteer |
| Deploy | VPS (PM2 + Nginx) |

Regras:
- **Valores monetários em AOA como inteiros** (sem casas decimais).
- **Quantidades** em `Decimal(14,3)`.
- Datas em UTC na BD; apresentação em `Africa/Luanda`.
- Idioma da interface: português (pt-AO). Textos centralizados num ficheiro de i18n para permitir outros idiomas no futuro.

## 3. Estrutura do repositório

```
/
├── CLAUDE.md
├── SPRINTS.md
├── apps/
│   ├── api/                 # Fastify
│   │   ├── src/
│   │   │   ├── modules/     # um módulo por domínio (ver §7)
│   │   │   ├── core/        # auth, tenant, features, audit, errors
│   │   │   ├── jobs/        # workers BullMQ
│   │   │   ├── integrations/# futurix-sms, cloudinary, anthropic
│   │   │   └── server.ts
│   │   └── prisma/schema.prisma
│   └── web/                 # React
│       └── src/
│           ├── modules/     # espelha os módulos da API
│           ├── components/
│           ├── features/    # FeatureGate, hooks de plano
│           └── i18n/
├── packages/shared/         # tipos, enums, validações (zod) partilhados
└── docker-compose.yml       # postgres + redis (dev)
```

Cada módulo da API: `routes.ts`, `service.ts`, `schemas.ts` (zod), `repository.ts` (opcional).

## 4. Multi-tenancy

- Modelo: **base de dados partilhada, `tenantId` em todas as tabelas de negócio**.
- O `tenantId` vem **sempre do token JWT**, nunca do body ou query.
- Extensão Prisma (`$extends`) que injecta automaticamente `where: { tenantId }` em leituras e `data: { tenantId }` em escritas. Proibido usar o client Prisma "cru" fora do `core`.
- Identificadores únicos de negócio (ex.: código do produto) são únicos **por tenant**: `@@unique([tenantId, code])`.
- **Super Admin (COMUNICA)** opera fora do contexto de tenant, numa área separada (`/admin`).
- Testes obrigatórios de isolamento: um utilizador do tenant A nunca acede a dados do tenant B.

## 5. Planos e feature flags (o "botão")

### 5.1 Modelo
```
Tenant.plan: STOCK | COMPLETO
Tenant.featureOverrides: Json   // ex.: { "ai_analyzer": false }
```
Mapa de features em `packages/shared/features.ts`:

| Feature | STOCK | COMPLETO |
|---|:-:|:-:|
| `stock` | ✔ | ✔ |
| `purchases` | ✔ | ✔ |
| `recipes` | ✔ | ✔ |
| `sales_import` | ✔ | ✔ |
| `alerts_sms` | ✔ | ✔ |
| `reports_stock` | ✔ | ✔ |
| `hr` | — | ✔ |
| `payroll` | — | ✔ |
| `daily_costs` | — | ✔ |
| `cash_closing` | — | ✔ |
| `payables` | — | ✔ |
| `financial_results` | — | ✔ |
| `ai_analyzer` | — | ✔ |

Features efectivas = mapa do plano + `featureOverrides`.

### 5.2 Onde fica o botão
- **Super Admin → Tenants → [tenant] → Plano**: selector STOCK / COMPLETO + toggles de override. É aqui que a COMUNICA controla o que cada cliente pagou.
- No painel do tenant, a página **Definições → Plano** mostra o plano actual (só leitura) e as funcionalidades bloqueadas com indicação "Disponível no plano Completo".

### 5.3 Aplicação
- **API**: decorator/preHandler `requireFeature('hr')` em todas as rotas do módulo. Sem a feature → `403 FEATURE_NOT_IN_PLAN`.
- **Web**: componente `<FeatureGate feature="hr">` e hook `useFeature()`. Menus e rotas escondidos quando a feature está inactiva.
- **Jobs**: workers verificam a feature antes de executar (ex.: relatório semanal IA).
- **Downgrade**: dados **nunca** são apagados; ficam inacessíveis até novo upgrade.
- Toda a alteração de plano é registada na auditoria.

## 6. Utilizadores, perfis e permissões

- `User` pertence a um tenant; acesso a **uma, várias ou todas as unidades** (`UserUnit`).
- Perfis base (o tenant pode criar perfis personalizados):

| Perfil | Âmbito |
|---|---|
| Administrador | Tudo no tenant |
| Gerente | Tudo na(s) sua(s) unidade(s) |
| Ecónomo | Stock, compras, inventários, transferências |
| Caixa | Fecho de caixa da sua unidade (COMPLETO) |
| RH | Módulo RH e salários (COMPLETO) |
| Consulta | Só leitura de relatórios |

- Permissões granulares no formato `modulo.accao` (ex.: `stock.adjust`, `cash.close`, `payroll.approve`).
- Perfil = conjunto de permissões. Verificação: `requirePermission('stock.adjust')`.
- Auth: JWT de acesso (15 min) + refresh token (httpOnly cookie). Senhas com argon2. 2FA opcional (fase posterior).

## 7. Módulos

### 7.1 Core
- **Tenants, Unidades, Locais de stock** — cada unidade tem 1+ locais (ex.: Armazém, Bar, Cozinha, Câmara frigorífica).
- **Auditoria** — tabela `AuditLog` (quem, quando, entidade, antes/depois) em todas as escritas sensíveis.
- **Definições do tenant** — logotipo, NIF, moeda (AOA), fuso, regras de alerta, destinatários SMS.

### 7.2 Catálogo
- **Categorias** hierárquicas (Bebidas > Cervejas, Alimentos > Carnes, Limpeza, Descartáveis…).
- **Unidades de medida** e **conversões por produto**: unidade de compra (caixa 24), unidade de stock (garrafa), unidade de consumo (ml).
- **Produto**: código, nome, categoria, unidade de stock, controla lote/validade (sim/não), stock mínimo e máximo **por local**, ponto de encomenda, fornecedor preferencial, activo.
- **Fornecedores**: dados, NIF, contactos, prazo de pagamento, produtos fornecidos e último preço.

### 7.3 Stock (núcleo)
- **Livro de movimentos imutável** (`StockMovement`). O saldo é derivado; tabela `StockBalance` mantida por transacção para performance.
- Tipos de movimento: `PURCHASE_IN`, `SALE_OUT` (via ficha técnica), `CONSUMPTION`, `WASTE` (quebra/desperdício com motivo), `TRANSFER_OUT`, `TRANSFER_IN`, `ADJUSTMENT_IN/OUT`, `INVENTORY_ADJUST`, `RETURN_SUPPLIER`.
- Correcções **nunca editam** movimentos: geram movimento de estorno.
- **Custeio: custo médio ponderado** por produto e unidade, recalculado em cada entrada.
- **Lotes e validades** (opcional por produto); saídas por FEFO.
- **Transferências** entre locais e entre unidades: estado `PENDENTE → ENVIADA → RECEBIDA` (com diferenças registadas na recepção).
- **Inventário**: abrir contagem (total ou por categoria/local) → contagem (web e mobile-friendly) → revisão de desvios → fecho gera `INVENTORY_ADJUST`. Bloqueio opcional de movimentos durante a contagem.
- Stock negativo: configurável por tenant (permitir com alerta / bloquear).

### 7.4 Compras
- Encomenda a fornecedor (opcional) → **Recepção** (com ou sem encomenda) → entrada em stock.
- Recepção regista quantidades, preço unitário, lote/validade, nº da factura do fornecedor e anexo (Cloudinary).
- Diferenças encomendado vs. recebido.
- Sugestão automática de encomenda (§7.8).
- No plano COMPLETO, cada recepção gera automaticamente uma **conta a pagar** (§7.12).

### 7.5 Fichas técnicas (receitas)
- Artigo de venda (prato, cocktail, bebida ao copo) → lista de ingredientes com quantidade na unidade de consumo e % de perda.
- Sub-receitas (ex.: molho base) suportadas.
- Local de saída por defeito por categoria (ex.: bebidas saem do Bar, pratos da Cozinha).
- Custo teórico calculado com o custo médio actual; margem vs. preço de venda.
- Artigos de revenda directa (ex.: garrafa de água) = ficha com 1 ingrediente.

### 7.6 Importação de vendas (POS)
Primeiro POS: **Winrest**, via exportação Excel. O formato real **ainda não é conhecido** — o importador tem de ser configurável.

- **Perfis de importação** por tenant: nome do POS, folha, linha de cabeçalho, mapeamento de colunas (código artigo, descrição, quantidade, valor, data, unidade/loja, método de pagamento), formato de data e separador decimal.
- Perfis pré-definidos (`winrest_vendas_artigo`, `winrest_pagamentos`) serão criados quando houver ficheiro real.
- Fluxo:
  1. Upload do ficheiro, escolha da unidade e do perfil.
  2. Parse e validação (job BullMQ) → pré-visualização com erros/avisos.
  3. **Mapeamento de artigos** POS ↔ fichas técnicas (guardado; feito uma só vez por artigo).
  4. Artigos sem mapeamento ficam **pendentes** (alerta), não bloqueiam o resto.
  5. Confirmação → gera `SALE_OUT` por ingrediente.
- **Anti-duplicação**: hash do ficheiro + verificação de sobreposição de período/unidade. Reimportação exige anular a importação anterior (estorno automático).
- Guardar sempre o ficheiro original (Cloudinary) e o lote de importação (`SalesImport`).
- Arquitectura preparada para conectores futuros (API/BD): interface `SalesSource`.

### 7.7 Alertas e notificações
- Tipos: stock abaixo do mínimo, rotura (zero), validade próxima (N dias configurável), stock acima do máximo, desvio de inventário acima de X%, artigos POS não mapeados, importação em falta (dia sem vendas importadas). COMPLETO: diferença de caixa, conta a pagar a vencer/vencida, anomalia detectada pela IA.
- Canais: **notificação na plataforma** (sino + centro de alertas) e **SMS (Futurix SMS)**.
- Destinatários SMS por defeito: **Administrador + Gerente da unidade + Ecónomo**. Configurável por tipo de alerta e por unidade.
- Regras anti-spam: um alerta por produto/local até ao estado mudar; digest diário opcional; horário de silêncio configurável.
- Envio por fila BullMQ com retries; registo de cada SMS (`SmsLog`) com custo para relatório.
- Avaliação de stock mínimo: após cada movimento + job de verificação periódica.

### 7.8 Relatórios e análises (plano STOCK)
Todos com filtros de período, unidade, local, categoria; vista consolidada; exportação **PDF e Excel**.
- Stock actual (quantidade e valor), por local e consolidado.
- Extracto de movimentos por produto (kardex).
- Consumo por produto/categoria/unidade/período.
- Rotação de stock, cobertura (dias de stock), produtos parados.
- Quebras e desperdício (por motivo, produto, responsável).
- Desvios de inventário (teórico vs. real) — indicador de perdas.
- Compras por fornecedor e evolução de preços.
- Custo teórico das vendas (via fichas técnicas) e margem por artigo.
- Comparativo entre unidades.
- Curva ABC de produtos (valor de consumo).
- **Sugestão de reposição**: consumo médio diário (últimos N dias, ponderado por dia da semana) × dias de cobertura − stock actual − encomendas pendentes, arredondado à unidade de compra.
- Dashboard: valor de stock, alertas activos, top consumos, quebras do mês, desvios.

### 7.9 RH (plano COMPLETO)
- Funcionários: dados pessoais, documentos (Cloudinary), unidade, cargo, data de admissão, tipo de contrato, salário base, subsídios fixos, dados bancários (IBAN — ver §9).
- Cargos e departamentos.
- Escalas/turnos por unidade (vista semanal).
- Presenças: registo manual pelo gerente (fase 1); integração com relógio de ponto em fase futura.
- Faltas (justificadas/injustificadas), horas extra, férias (saldo e pedidos), licenças.
- Adiantamentos e descontos.

### 7.10 Salários (plano COMPLETO)
- Processamento mensal por tenant/unidade: salário base + subsídios + horas extra − faltas − adiantamentos − INSS − IRT.
- **Taxas de INSS e tabela de IRT configuráveis** (tabela versionada por data de vigência). Não fixar valores no código; os valores iniciais devem ser validados com a legislação angolana em vigor.
- Estados: `RASCUNHO → APROVADO → PAGO`.
- Recibos de vencimento em PDF; mapa de salários em Excel.
- Custo de pessoal alimenta o resultado (§7.13).

### 7.11 Custos diários e fecho de caixa (plano COMPLETO)
**Custos diários**
- Registo por unidade: data, categoria (renda, energia, água, gás, combustível gerador, manutenção, limpeza, marketing, outros — configuráveis), valor, método de pagamento, comprovativo.
- Custos recorrentes (ex.: renda mensal) gerados automaticamente.

**Fecho de caixa**
- Por unidade e por turno (configurável: fecho diário único ou por turno).
- Abertura com fundo de caixa.
- Valores do sistema: importados do POS (perfil de pagamentos) ou introduzidos manualmente.
- Valores contados: numerário (contagem por notas opcional), TPA/Multicaixa, Multicaixa Express, transferência, outros.
- Sangrias/entradas durante o turno, pagamentos feitos da caixa (ligam a custos diários).
- Diferença calculada; acima do limite configurado → justificação obrigatória + alerta.
- Estados: `ABERTO → FECHADO → VALIDADO` (pelo gerente). Fecho validado é imutável.

### 7.12 Contas a pagar (plano COMPLETO)
- Origem: recepções de compras (automático) ou lançamento manual.
- Vencimento calculado pelo prazo do fornecedor.
- Pagamentos parciais/totais, com comprovativo.
- Relatórios: dívida por fornecedor, antiguidade de saldos (0–30, 31–60, 61–90, +90 dias), previsão de pagamentos.

### 7.13 Resultados financeiros (plano COMPLETO)
- Por unidade e consolidado, diário/mensal:
  - Receita (vendas importadas)
  - − CMV (custo das saídas por venda + quebras)
  - − Custos operacionais (custos diários)
  - − Custo de pessoal (salários processados, rateado por dia no diário)
  - = Resultado operacional
- Indicadores: CMV %, custo de pessoal %, ticket médio (se o POS exportar nº de documentos), margem por artigo, ponto de equilíbrio.
- Dashboard executivo com comparação entre unidades e períodos.

### 7.14 Analisador IA (plano COMPLETO)
Implementado com a **Anthropic API** (tool use). O modelo **nunca acede à BD directamente**.

- **Ferramentas (tools)** expostas ao modelo: funções de leitura agregada, sempre filtradas pelo `tenantId` e pelas unidades do utilizador. Ex.: `get_stock_summary`, `get_consumption`, `get_waste`, `get_inventory_variances`, `get_cash_closings`, `get_daily_costs`, `get_financial_result`, `get_payables_aging`, `get_sales_by_item`. Devolvem dados agregados (sem dados pessoais sensíveis de funcionários).
- **Funcionalidades**:
  1. **Chat em linguagem natural** — "Quanto gastámos em bebidas no Beach este mês?". Respostas com números e, quando útil, gráfico.
  2. **Detecção de anomalias** (job diário) — regras estatísticas calculadas no backend (z-score / desvio vs. média móvel) sobre consumo, quebras, desvios de inventário, diferenças de caixa e custos; a IA explica e prioriza as anomalias.
  3. **Previsão** de consumo/compras (média móvel sazonal por dia da semana no backend; IA comenta e ajusta pelo contexto).
  4. **Relatório semanal automático** por unidade com resumo e recomendações (PDF + notificação; SMS resumido opcional).
- Regras: prompts de sistema em ficheiro versionado; registar cada pedido (`AiRequest`: utilizador, tokens, custo) para controlo de custos por tenant; limite mensal de pedidos por tenant configurável; a IA responde só com base nos dados das tools e indica quando não tem dados suficientes.

### 7.15 Super Admin (COMUNICA)
- Criar/editar/suspender tenants.
- **Selector de plano** e overrides de features (§5).
- Limites por tenant: nº de unidades, nº de utilizadores, SMS mensais, pedidos IA.
- Métricas de uso (SMS enviados, pedidos IA, importações) para facturação.
- Impersonation (entrar como admin do tenant) com registo em auditoria.
- Cobrança de subscrições: fase futura (ProxyPay/Multicaixa).

## 8. Modelo de dados (resumo)

Entidades principais (todas com `id`, `tenantId`, `createdAt`, `updatedAt`, salvo indicação):

- `Tenant` (sem tenantId) — nome, nif, plan, featureOverrides, limites, estado
- `Unit` — nome, morada, activo
- `StockLocation` — unitId, nome, tipo
- `User`, `Role`, `Permission`, `UserUnit`, `RefreshToken`
- `Category`, `MeasureUnit`, `Product`, `ProductUnitConversion`, `ProductLocationLimit` (min/max por local)
- `Supplier`, `SupplierProduct`
- `PurchaseOrder`, `PurchaseOrderLine`, `GoodsReceipt`, `GoodsReceiptLine`
- `Lot` — productId, código, validade
- `StockMovement` — productId, locationId, lotId?, type, qty, unitCost, totalCost, refType, refId, userId, occurredAt
- `StockBalance` — productId, locationId, qty, avgCost
- `Transfer`, `TransferLine`
- `InventoryCount`, `InventoryCountLine`
- `SaleItem` (artigo de venda), `Recipe`, `RecipeLine`
- `ImportProfile`, `SalesImport`, `SalesImportLine`, `PosItemMapping`
- `Alert`, `AlertRule`, `AlertRecipient`, `Notification`, `SmsLog`
- `Employee`, `Position`, `Shift`, `Attendance`, `Leave`, `Advance`
- `PayrollRun`, `PayrollLine`, `TaxTable` (versionada)
- `CostCategory`, `DailyCost`, `RecurringCost`
- `CashSession`, `CashCount`, `CashMovement`
- `Payable`, `PayablePayment`
- `AiRequest`, `AiReport`
- `AuditLog`

Índices obrigatórios: `(tenantId, ...)` em todas as consultas frequentes; `StockMovement (tenantId, productId, locationId, occurredAt)`.

## 9. Segurança e privacidade

- Isolamento de tenant (§4) testado em CI.
- Rate limiting (`@fastify/rate-limit`), Helmet, CORS restrito.
- Validação de todos os inputs com zod.
- Dados sensíveis de funcionários (IBAN, salário, documentos): só perfis com permissão `hr.sensitive`; IBAN encriptado na BD (AES-256-GCM, chave em variável de ambiente).
- Uploads: validação de tipo e tamanho; Excel processado em worker com limite de linhas.
- Backups diários do PostgreSQL com retenção de 30 dias e cópia fora da VPS.
- Logs estruturados (pino) sem dados sensíveis.

## 10. Convenções

- TypeScript strict em todo o projecto.
- Respostas da API: `{ data }` ou `{ error: { code, message } }`; códigos de erro em `packages/shared/errors.ts`.
- Paginação por cursor nas listagens grandes (movimentos, auditoria).
- Operações de stock sempre dentro de `prisma.$transaction` com lock da linha de `StockBalance` (`SELECT ... FOR UPDATE`).
- Nenhum valor de negócio (taxas, limites, categorias, textos de cliente) fixo no código: tudo em BD/definições.
- Seeds: tenant de demonstração genérico. Os dados do grupo Palace são criados pelo Super Admin, nunca em seeds.
- Testes: Vitest; testes obrigatórios para custeio médio, fichas técnicas, importação, alertas, fecho de caixa, salários e isolamento de tenant.
- Commits pequenos, um por funcionalidade; actualizar `SPRINTS.md` ao concluir tarefas.

## 11. Variáveis de ambiente

```
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
ENCRYPTION_KEY=
FUTURIX_SMS_API_URL=https://sms-api.futurix.ao
FUTURIX_SMS_API_KEY=
FUTURIX_SMS_SENDER=
CLOUDINARY_URL=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=
APP_URL=
TZ_DISPLAY=Africa/Luanda
```

## 12. Pendências conhecidas

- **Ficheiro de exportação Winrest** (vendas por artigo e por método de pagamento) — necessário para criar os perfis de importação pré-definidos. Até lá, o importador funciona com mapeamento manual de colunas.
- Validar tabela de IRT e taxas de INSS em vigor antes de activar salários em produção.
- Nome comercial definitivo da plataforma.
- Modelo de preços por plano (fora do âmbito técnico).
