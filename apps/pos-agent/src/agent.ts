/**
 * Agente POS local: corre na máquina onde está a BD do POS (SQLite do Winrest) e, a cada ciclo,
 * com ligação SÓ DE LEITURA:
 *  - mesas: envia a lista das mesas abertas (ocupa/liberta as mesas no RestoGest);
 *  - vendas: envia as facturas fechadas dos últimos dias que o servidor ainda não tem
 *    (receita, stock e caixa em tempo real);
 *  - cozinha (POS_KITCHEN=on): envia os artigos pedidos nas mesas abertas, com a zona (ecrã de cozinha).
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
const kitchenOn = process.env.POS_KITCHEN === 'on';
// Códigos da BD do Winrest (BD de demonstração analisada em 2026-11); confirmar com --check.
const posName = env('POS_NAME', 'Winrest');
const saleTypes = list(env('POS_SALE_DOCTYPES', '1018,1005')); // Factura-recibo, Factura
const internalTypes = list(env('POS_INTERNAL_DOCTYPES', '1300')); // Consumo próprio
const internalPay = list(env('POS_INTERNAL_PAYMETHODS', 'CI')); // Consumo Interno
const closedStatus = env('POS_CLOSED_STATUS', '8002');
const cancelledStatus = env('POS_CANCELLED_STATUS', '8003');
const openStatus = env('POS_OPEN_STATUS', '8001');
const lineCancelledStatus = env('POS_LINE_CANCELLED_STATUS', '8502');
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
  // POS_TODAY (YYYY-MM-DD): só para testar com cópias antigas da BD
  const local = process.env.POS_TODAY || new Date().toLocaleDateString('en-CA'); // fuso da máquina do POS
  return Math.round((Date.parse(local) - DAY0) / 86_400_000);
};

/**
 * Primeiro dia de negócio a vigiar: o anterior ao de ontem (cobre fechos tardios e o `doc_date`
 * adiantado do Winrest). POS_SALES_FROM (YYYY-MM-DD) recua mais, para recuperar dias antigos.
 */
function salesFrom() {
  const from = process.env.POS_SALES_FROM;
  return from ? Math.round((Date.parse(from) - DAY0) / 86_400_000) : todaySerial() - 2;
}

/**
 * Ids das facturas fechadas nos dias vigiados. Não há cursor: o que já foi enviado decide-se pelo
 * id do documento (o servidor diz quais lhe faltam), por isso a hora/data do relógio do POS não
 * faz saltar facturas.
 */
function closedSaleIds(db: DatabaseSync) {
  const types = [...saleTypes, ...internalTypes];
  return all(
    db,
    `SELECT id FROM docheader
     WHERE deleted = 0 AND docstatus_id = ? AND docconfig_id IN (${marks(types.length)})
       AND doc_date >= ?
     ORDER BY clock_date`,
    BigInt(closedStatus),
    ...types.map(BigInt),
    BigInt(salesFrom()),
  ).map((r) => String(r.id));
}

/** Facturas anuladas depois de fechadas nos dias vigiados: o servidor estorna só as que recebeu. */
function cancelledSaleIds(db: DatabaseSync) {
  return all(
    db,
    `SELECT id FROM docheader WHERE deleted = 0 AND docstatus_id = ?
       AND docconfig_id IN (${marks(saleTypes.length)}) AND doc_date >= ?`,
    BigInt(cancelledStatus),
    ...saleTypes.map(BigInt),
    BigInt(salesFrom()),
  ).map((r) => String(r.id));
}

/** Facturas completas (linhas e pagamentos) a partir dos ids. */
function readSales(db: DatabaseSync, docIds: string[]) {
  if (!docIds.length) return [];
  const heads = all(
    db,
    `SELECT id, docconfig_id, doc_prefix, doc_number, doc_date, clock_date, accumulator, total
     FROM docheader WHERE id IN (${marks(docIds.length)}) ORDER BY clock_date`,
    ...docIds.map(BigInt),
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
  return docs;
}

// ---------------------------------------------------------------- Cozinha

/**
 * Artigos das contas abertas (mesas) com a zona de impressão do produto na loja.
 * Linhas enviadas juntas partilham `cronano` = ronda (um talão por mesa, ronda e zona).
 * `docmovdetail.employee_id` = empregado que lançou a ronda (nome em `entity.description`).
 */
function kitchenLines(db: DatabaseSync) {
  return all(
    db,
    `SELECT d.id, d.docheader_id, d.cronano, d.line_number, h.accumulator, d.product_code,
            d.description, d.qnt, d.detailstatus_id, z.description AS zone, e.description AS waiter
     FROM docheader h
     JOIN docmovdetail d ON d.docheader_id = h.id AND d.deleted = 0
     JOIN store_product sp ON sp.product_id = d.product_id AND sp.store_id = h.store_id AND sp.deleted = 0
     JOIN printzone z ON z.id = sp.printzone_id
     LEFT JOIN entity e ON e.id = d.employee_id
     WHERE h.deleted = 0 AND h.docstatus_id = ? AND h.doc_number = 0 AND h.accumulator > 0
       AND h.docconfig_id IN (${marks(saleTypes.length)}) AND h.doc_date >= ?`,
    BigInt(openStatus),
    ...saleTypes.map(BigInt),
    BigInt(todaySerial() - 1),
  ).map((r) => ({
    id: String(r.id),
    docId: String(r.docheader_id),
    round: String(r.cronano),
    zone: String(r.zone).trim(),
    table: String(r.accumulator),
    waiter: String(r.waiter ?? '').trim() || null,
    code: String(r.product_code ?? ''),
    label: String(r.description ?? ''),
    qty: Number(r.qnt),
    position: Number(r.line_number),
    cancelled: String(r.detailstatus_id) === lineCancelledStatus,
  }));
}

// ---------------------------------------------------------------- --check

if (process.argv.includes('--check')) {
  withDb((db) => {
    if (tablesQuery) console.log('Mesas abertas:', openTables(db));
    if (kitchenOn) {
      const k = kitchenLines(db);
      const zones = [...new Set(k.map((l) => l.zone))];
      console.log(`Cozinha: ${k.length} artigos em contas abertas; zonas: ${zones.join(', ')}`);
    }
    if (salesOn) {
      const ids = closedSaleIds(db);
      console.log(`Facturas fechadas nos dias vigiados: ${ids.length}`);
      console.log(readSales(db, ids.slice(-3)));
      console.log('Anuladas recentes:', cancelledSaleIds(db));
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

let lastKitchen = '';
async function syncKitchen() {
  const lines = withDb(kitchenLines);
  const d = await call<{ created: number; closed: number }>('/kitchen', { lines });
  const msg = d.created || d.closed ? `cozinha: +${d.created} talões · ${d.closed} fechados` : '';
  if (msg && msg !== lastKitchen) log(msg);
  lastKitchen = msg;
}

/** Facturas que o servidor já tem (ou recusou de vez): não se voltam a perguntar até reiniciar. */
const sentDocs = new Set<string>();
const sentCancelled = new Set<string>();
async function syncSales() {
  const { ids, cancelled } = withDb((db) => ({
    ids: closedSaleIds(db),
    cancelled: cancelledSaleIds(db),
  }));
  const fresh = ids.filter((id) => !sentDocs.has(id));
  const freshCancelled = cancelled.filter((id) => !sentCancelled.has(id));
  if (!fresh.length && !freshCancelled.length) return;

  let missing: string[] = [];
  for (let i = 0; i < fresh.length; i += 1000) {
    const part = fresh.slice(i, i + 1000);
    const d = await call<{ missing: string[] }>('/sales/missing', { ids: part });
    const miss = new Set(d.missing);
    for (const id of part) if (!miss.has(id)) sentDocs.add(id);
    missing = missing.concat(part.filter((id) => miss.has(id)));
  }

  // envia as que faltam em lotes; as anuladas vão no primeiro
  for (let i = 0, first = true; i < missing.length || first; i += BATCH, first = false) {
    const part = missing.slice(i, i + BATCH);
    const extra = first ? freshCancelled : [];
    if (!part.length && !extra.length) return;
    const d = await call<{
      accepted: number;
      duplicates: number;
      cancelled: number;
      skippedDays: string[];
    }>('/sales', {
      posName,
      cursor: null,
      docs: withDb((db) => readSales(db, part)),
      cancelled: extra,
    });
    for (const id of part) sentDocs.add(id);
    for (const id of extra) sentCancelled.add(id);
    if (d.accepted || d.cancelled) log(`vendas: +${d.accepted} facturas · ${d.cancelled} anuladas`);
    if (d.skippedDays.length)
      log(`vendas ignoradas (dia já importado por ficheiro): ${d.skippedDays.join(', ')}`);
  }
}

log(`agente POS a sincronizar com ${apiUrl} a cada ${everyMs / 1000}s`);
for (;;) {
  if (tablesQuery) await syncTables().catch((e: Error) => log(`erro (mesas): ${e.message}`));
  if (kitchenOn) await syncKitchen().catch((e: Error) => log(`erro (cozinha): ${e.message}`));
  if (salesOn)
    await syncSales().catch((e: Error) => {
      log(`erro (vendas): ${e.message}`);
    });
  await sleep(everyMs);
}
