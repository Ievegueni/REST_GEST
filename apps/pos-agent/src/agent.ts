/**
 * Agente POS local: corre na máquina onde está a BD do POS (SQLite), lê as mesas abertas
 * com uma consulta configurável — ligação SÓ DE LEITURA — e envia a lista completa ao RestoGest.
 * Se a consulta falhar não envia nada — nunca liberta mesas por engano.
 *
 *   node --env-file=.env dist/agent.js          sincroniza a cada POS_SYNC_SECONDS
 *   node --env-file=.env dist/agent.js --check  mostra as mesas abertas e sai (não envia)
 */
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as sleep } from 'node:timers/promises';

function env(name: string, fallback?: string) {
  const v = process.env[name] || fallback;
  if (!v) {
    console.error(`Falta a variável ${name} no .env`);
    process.exit(1);
  }
  return v;
}

const dbPath = env('POS_DB_PATH');
const query = env('POS_OPEN_TABLES_QUERY');
const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);

/** Nomes das mesas abertas: coluna `mesa`, ou a primeira coluna da consulta. */
function openTables() {
  // abre e fecha a cada leitura: o POS pode substituir o ficheiro (backups, reinícios)
  const db = new DatabaseSync(dbPath, { readOnly: true, timeout: 5000 });
  try {
    const rows = db.prepare(query).all() as Record<string, unknown>[];
    return rows.map((r) => String(r.mesa ?? Object.values(r)[0] ?? '').trim()).filter(Boolean);
  } finally {
    db.close();
  }
}

if (process.argv.includes('--check')) {
  console.log(openTables());
  process.exit(0);
}

const apiUrl = env('RESTGEST_API_URL').replace(/\/$/, '');
const key = env('RESTGEST_AGENT_KEY');
const everyMs = Number(env('POS_SYNC_SECONDS', '15')) * 1000;

log(`agente POS a sincronizar com ${apiUrl} a cada ${everyMs / 1000}s`);
let lastUnknown = '';
for (;;) {
  try {
    const open = openTables();
    const res = await fetch(`${apiUrl}/pos-agent/tables`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-key': key },
      body: JSON.stringify({ open }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json()) as {
      data?: { opened: number; closed: number; unknown: string[] };
      error?: { message: string };
    };
    if (!res.ok) throw new Error(body.error?.message ?? res.statusText);
    const d = body.data!;
    if (d.opened || d.closed)
      log(`${open.length} abertas · +${d.opened} ocupadas · ${d.closed} libertadas`);
    const unknown = d.unknown.join(', ');
    if (unknown && unknown !== lastUnknown)
      log(`mesas do POS sem correspondência no RestoGest: ${unknown}`);
    lastUnknown = unknown;
  } catch (e) {
    log(`erro: ${(e as Error).message}`);
  }
  await sleep(everyMs);
}
