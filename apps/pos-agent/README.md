# Agente POS (local)

Corre na máquina onde está a base de dados do POS (ficheiro **SQLite**). A cada
`POS_SYNC_SECONDS` lê as mesas abertas (ligação **só de leitura**) e envia a lista ao RestoGest, que:

- ocupa as mesas abertas no POS que estavam livres;
- liberta as mesas que o POS fechou (só as que já tinha visto abertas no POS);
- ignora (e reporta no log) mesas do POS que não existem no RestoGest.

Se a leitura falhar, não envia nada — nunca liberta mesas por engano.
Só precisa de saída HTTPS para a internet — nada a abrir na firewall. Sem dependências: Node.js ≥ 22.13.

## Como o Winrest guarda as mesas (BD de demonstração analisada em 2026-11)

- Cada mesa é um **acumulador** (número). As áreas e as faixas estão em `store_local`
  (ex.: `1:40` Deck_1, `101:120` Lounge, `201:240` Deck_2; `501:560` são entregas, não mesas).
- **Mesa aberta** = linha de `docheader` com Factura-recibo (`docconfig_id = 1018`) em estado
  Aberto (`docstatus_id = 8001`), `deleted = 0`, ainda sem número (`doc_number = 0`) e `accumulator > 0`.
  Ao fechar a conta, este rascunho fica `deleted = 1` e nasce a factura numerada.
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
   npm run check                               # mostra as mesas abertas agora (não envia nada)
   npm start
   ```
3. Para arrancar com o Windows, instalar como serviço
   (ex.: [NSSM](https://nssm.cc): `nssm install RestoGestAgente node --no-warnings --env-file=.env dist\agent.js`,
   com a pasta do agente como directório de trabalho).
