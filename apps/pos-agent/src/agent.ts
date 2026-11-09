/**
 * Agente POS local: corre na máquina onde está a BD do POS (SQLite do Winrest) e, a cada ciclo,
 * com ligação SÓ DE LEITURA:
 *  - mesas: envia a lista das mesas abertas (ocupa/liberta as mesas no RestoGest);
 *  - vendas: envia as facturas fechadas desde a última enviada (receita, stock e caixa em tempo real).
 * Se uma leitura falhar não envia nada dessa parte — nunca liberta mesas nem perde vendas por engano.
 *
 *   node --env-file=.env dist/agent.js          sincroniza a cada POS_SYNC_SECONDS
 *   node --env-file=.env dist/agent.js --check  mostra mesas abertas e últimas vendas e sai (não envia)
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { setTimeout as sleep } from 'node:timers/promises';

function env(name: string, fallback?: string) {
  const v = process.env[name] || fallback;
  if (!v) {
    console.error(`Falta a variável ${name} no .env`);
    process.exit(1);
  }
  return v;
}
const list = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const dbPath = env('POS_DB_PATH');
const tablesQuery = process.env.POS_OPEN_TABLES_QUERY;
const salesOn = process.env.POS_SALES !== 'off';
// Códigos da BD do Winrest (BD de demonstração analisada em 2026-11); confirmar com --check.
const posName = env('POS_NAME', 'Winrest');
const saleTypes = list(env('POS_SALE_DOCTYPES', '1018,1005')); // Factura-recibo, Factura
const internalTypes = list(env('POS_INTERNAL_DOCTYPES', '1300')); // Consumo próprio
const internalPay = list(env('POS_INTERNAL_PAYMETHODS', 'CI')); // Consumo Interno
const closedStatus = env('POS_CLOSED_STATUS', '8002');
const cancelledStatus = env('POS_CANCELLED_STATUS', '8003');
const BATCH = 100;

const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);

/** Corre `fn` com a BD aberta só em leitura (abre e fecha a cada ciclo: o POS pode trocar o ficheiro). */
function withDb<T>(fn: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(dbPath, { readOnly: true, timeout: 5000 });
  try {
    return fn(db);
  } finally {
    db.close();
  }
}
/** Inteiros como BigInt: ids e marcas de tempo (ns) do Winrest excedem a precisão de Number. */
function all(db: DatabaseSync, sql: string, ...params: SQLInputValue[]) {
  const st = db.prepare(sql);
  st.setReadBigInts(true);
  return st.all(...params) as Record<string, unknown>[];
}
const marks = (n: number) => Array(n).fill('?').join(',');

// ---------------------------------------------------------------- Mesas

/** Nomes das mesas abertas: coluna `mesa`, ou a primeira coluna da consulta. */
function openTables(db: DatabaseSync) {
  return all(db, tablesQuery!)
    .map((r) => String(r.mesa ?? Object.values(r)[0] ?? '').trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------- Vendas

/** `doc_date` do Winrest = dias desde 1901-01-01 (dia de negócio). */
const DAY0 = Date.UTC(1901, 0, 1);
const toDay = (n: unknown) => new Date(DAY0 + Number(n) * 86_400_000).toISOString().slice(0, 10);
const todaySerial = () => {
  const local = new Date().toLocaleDateString('en-CA'); // fuso da máquina do POS
  return Math.round((Date.parse(local) - DAY0) / 86_400_000);
};

/** Próximo lote de facturas fechadas depois de `cursor` (clock_date em ns). */
function readSales(db: DatabaseSync, cursor: string | null) {
  const types = [...saleTypes, ...internalTypes];
  const heads = all(
    db,
    `SELECT id, docconfig_id, doc_prefix, doc_number, doc_date, clock_date, accumulator, total
     FROM docheader
     WHERE deleted = 0 AND docstatus_id = ? AND docconfig_id IN (${marks(types.length)})
       AND clock_date > ? ${cursor ? '' : 'AND doc_date >= ?'}
     ORDER BY clock_date LIMIT ${BATCH}`,
    BigInt(closedStatus),
    ...types.map(BigInt),
    BigInt(cursor ?? 0),
    // primeira vez: só o dia de negócio anterior e o actual (POS_SALES_FROM para recuperar mais)
    ...(cursor
      ? []
      : [
          BigInt(
            process.env.POS_SALES_FROM
              ? Math.round((Date.parse(process.env.POS_SALES_FROM) - DAY0) / 86_400_000)
              : todaySerial() - 1,
          ),
        ]),
  );
  const ids = heads.map((h) => h.id as bigint);
  const lines = ids.length
    ? all(
        db,
        `SELECT docheader_id, product_code, description, qnt, total, gross_total FROM docmovdetail
         WHERE deleted = 0 AND product_code <> '' AND docheader_id IN (${marks(ids.length)})
         ORDER BY docheader_id, line_number`,
        ...ids,
      )
    : [];
  const pays = ids.length
    ? all(
        db,
        `SELECT f.docheader_id, p.code, p.description, f.payvalue
         FROM docfooter f JOIN paymethod p ON p.id = f.paymethod_id
         WHERE f.deleted = 0 AND f.docheader_id IN (${marks(ids.length)})`,
        ...ids,
      )
    : [];
  // anuladas depois de fechadas (dia actual e anterior): o servidor estorna só as que recebeu
  const cancelled = all(
    db,
    `SELECT id FROM docheader WHERE deleted = 0 AND docstatus_id = ?
       AND docconfig_id IN (${marks(saleTypes.length)}) AND doc_date >= ?`,
    BigInt(cancelledStatus),
    ...saleTypes.map(BigInt),
    BigInt(todaySerial() - 1),
  ).map((r) => String(r.id));

  const docs = heads.map((h) => {
    const id = h.id as bigint;
    const docLines = lines.filter((l) => l.docheader_id === id);
    // desconto/oferta no total da conta: as linhas são reduzidas na mesma proporção (soma = total pago)
    const grossSum = docLines.reduce((x, l) => x + Number(l.gross_total), 0);
    const total = Number(h.total);
    const factor = grossSum > 0 && Math.abs(grossSum - total) > 1 ? total / grossSum : 1;
    const payments = pays
      .filter((p) => p.docheader_id === id)
      .map((p) => ({
        code: String(p.code),
        name: p.description == null ? null : String(p.description),
        amount: Number(p.payvalue),
      }));
    return {
      id: String(id),
      number: `${String(h.doc_prefix ?? '').trim()}/${String(h.doc_number)}`,
      table: Number(h.accumulator) > 0 ? String(h.accumulator) : null,
      businessDate: toDay(h.doc_date),
      closedAt: new Date(Number((h.clock_date as bigint) / 1_000_000n)).toISOString(),
      total,
      internal:
        internalTypes.includes(String(h.docconfig_id)) ||
        (payments.length > 0 && payments.every((p) => internalPay.includes(p.code))),
      lines: docLines.map((l) => ({
        code: String(l.product_code).trim(),
        label: l.description == null ? null : String(l.description),
        qty: Number(l.qnt),
        amount: Number(l.total) * factor,
        gross: Number(l.gross_total) * factor,
      })),
      payments,
    };
  });
  const last = heads.at(-1);
  return { docs, cancelled, cursor: last ? String(last.clock_date) : cursor };
}

// ---------------------------------------------------------------- --check

if (process.argv.includes('--check')) {
  withDb((db) => {
    if (tablesQuery) console.log('Mesas abertas:', openTables(db));
    if (salesOn) {
      const s = readSales(db, null);
      console.log(`Vendas desde o dia anterior: ${s.docs.length} (primeiro lote)`);
      console.log(s.docs.slice(-3));
      console.log('Anuladas recentes:', s.cancelled);
    }
  });
  process.exit(0);
}

// ---------------------------------------------------------------- Ciclo

const apiUrl = env('RESTGEST_API_URL').replace(/\/$/, '');
const key = env('RESTGEST_AGENT_KEY');
const everyMs = Number(env('POS_SYNC_SECONDS', '15')) * 1000;

async function call<T>(path: string, body?: object): Promise<T> {
  const res = await fetch(`${apiUrl}/pos-agent${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-agent-key': key },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json()) as { data?: T; error?: { message: string } };
  if (!res.ok) throw new Error(json.error?.message ?? res.statusText);
  return json.data!;
}

let lastUnknown = '';
async function syncTables() {
  const open = withDb(openTables);
  const d = await call<{ opened: number; closed: number; unknown: string[] }>('/tables', { open });
  if (d.opened || d.closed)
    log(`mesas: ${open.length} abertas · +${d.opened} ocupadas · ${d.closed} libertadas`);
  const unknown = d.unknown.join(', ');
  if (unknown && unknown !== lastUnknown)
    log(`mesas do POS sem correspondência no RestoGest: ${unknown}`);
  lastUnknown = unknown;
}

let cursor: string | null | undefined; // undefined = pedir ao servidor
async function syncSales() {
  cursor ??= (await call<{ cursor: string | null }>('/sales/cursor')).cursor;
  // recupera o atraso em lotes; as anuladas vão só no primeiro
  for (let first = true; ; first = false) {
    const batch = withDb((db) => readSales(db, cursor!));
    if (!batch.docs.length && (!first || !batch.cancelled.length)) return;
    const d = await call<{
      accepted: number;
      duplicates: number;
      cancelled: number;
      skippedDays: string[];
    }>('/sales', {
      posName,
      cursor: batch.cursor,
      docs: batch.docs,
      cancelled: first ? batch.cancelled : [],
    });
    cursor = batch.cursor;
    if (d.accepted || d.cancelled) log(`vendas: +${d.accepted} facturas · ${d.cancelled} anuladas`);
    if (d.skippedDays.length)
      log(`vendas ignoradas (dia já importado por ficheiro): ${d.skippedDays.join(', ')}`);
    if (batch.docs.length < BATCH) return;
  }
}

log(`agente POS a sincronizar com ${apiUrl} a cada ${everyMs / 1000}s`);
for (;;) {
  if (tablesQuery) await syncTables().catch((e: Error) => log(`erro (mesas): ${e.message}`));
  if (salesOn)
    await syncSales().catch((e: Error) => {
      cursor = undefined; // volta a perguntar ao servidor onde ficou
      log(`erro (vendas): ${e.message}`);
    });
  await sleep(everyMs);
}
