# Agente POS (local)

Corre na máquina onde está a base de dados do POS (ficheiro **SQLite**). A cada
`POS_SYNC_SECONDS`, com ligação **só de leitura**, envia ao RestoGest:

**Mesas** — a lista das mesas abertas; o RestoGest:

- ocupa as mesas abertas no POS que estavam livres;
- liberta as mesas que o POS fechou (só as que já tinha visto abertas no POS);
- ignora (e reporta no log) mesas do POS que não existem no RestoGest.

**Vendas** — as facturas fechadas desde a última enviada (a marca fica no servidor):

- entram numa importação de vendas "do dia" já confirmada: receita (sem IVA) nos resultados e no painel,
  saída de stock pelas fichas técnicas (artigos sem mapeamento ficam pendentes, com alerta);
- desconto/oferta no total da conta é repartido pelas linhas (a receita bate com o que foi pago);
- consumo próprio (doc. 1300) ou pago com Consumo Interno (CI): baixa stock, sem receita;
- factura anulada depois de fechada (estado 8003): estorno de receita e stock;
- pagamentos por meio (NU, MC…) preenchem o fecho de caixa (botão **Valores do POS**;
  definir o código POS em Definições → Caixa);
- dias já importados por ficheiro Excel são ignorados (não conta a dobrar).

**Cozinha** (`POS_KITCHEN=on`, plano Completo) — os artigos pedidos nas mesas abertas com a zona de
impressão do produto (`store_product.printzone_id` → Cozinha, Bar, Sushi…). Artigos enviados juntos
(mesmo `cronano`) formam um talão por mesa e zona; a hora do talão é a hora em que o agente o vê
(o Winrest não guarda uma hora legível por linha), por isso usar `POS_SYNC_SECONDS=5`.
Ecrã: `/cozinha?zona=Cozinha` (TV com teclado numérico/bump bar, toque ou rato).

Se a leitura falhar, não envia nada — nunca liberta mesas nem perde vendas por engano; ao voltar, retoma onde ficou.
Só precisa de saída HTTPS para a internet — nada a abrir na firewall. Sem dependências: Node.js ≥ 22.13.

## Como o Winrest guarda as mesas (BD de demonstração analisada em 2026-11)

- Cada mesa é um **acumulador** (número). As áreas e as faixas estão em `store_local`
  (ex.: `1:40` Deck_1, `101:120` Lounge, `201:240` Deck_2; `501:560` são entregas, não mesas).
- **Mesa aberta** = linha de `docheader` com Factura-recibo (`docconfig_id = 1018`) em estado
  Aberto (`docstatus_id = 8001`), `deleted = 0`, ainda sem número (`doc_number = 0`) e `accumulator > 0`.
  Ao fechar a conta, este rascunho fica `deleted = 1` e nasce a factura numerada.
- **Factura fechada** = `docheader` Factura-recibo/Factura (1018/1005) em estado Fechado (8002);
  linhas em `docmovdetail` (`total` sem IVA, `gross_total` com IVA), pagamentos em `docfooter` + `paymethod`.
  `clock_date` (hora de fecho) em nanossegundos — lida como BigInt.
- Os documentos "Anulação" (1002) parecem ser artigos anulados antes de fechar a conta (a factura já os exclui): não são enviados. Confirmar na BD real.
- `doc_date` = dias desde 1901-01-01 (dia de negócio). A consulta só considera o dia actual
  e o anterior, para ignorar rascunhos antigos abandonados.

A consulta está em `.env.example`. Os ids (1018, 8001) vêm da BD de demonstração: confirmar com `npm run check` na instalação real.

## Instalação (uma vez por unidade)

1. No RestoGest: **Definições → Mesas → Criar várias (numeradas)** com **os números do POS**
   (ex.: 1–40 área Deck_1, 101–120 Lounge, 201–240 Deck_2) e **Gerar chave do agente**.
2. Na máquina do POS (Node.js ≥ 22.13):
   ```
   pnpm --filter @restgest/pos-agent build     # na máquina de desenvolvimento
   # copiar para o POS: dist/agent.js, package.json, .env.example
   copy .env.example .env                      # e preencher (caminho da BD, chave, URL)
   npm run check                               # mostra mesas abertas e as últimas vendas (não envia nada)
   npm start
   ```
3. Para arrancar com o Windows, instalar como serviço
   (ex.: [NSSM](https://nssm.cc): `nssm install RestoGestAgente node --no-warnings --env-file=.env dist\agent.js`,
   com a pasta do agente como directório de trabalho).
