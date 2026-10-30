/**
 * Alertas: regras, deduplicação por chave (um aberto por chave até o estado mudar),
 * destinatários por perfil/unidade, notificações e SMS.
 */
import { Prisma, type AlertType } from '@prisma/client';
import { ALERT_DEFAULTS, DEFAULT_ALERT_ROLES } from '@restgest/shared';
import { env } from '../../core/env';
import { tenantDb, type TenantDb } from '../../core/prisma';
import { normalizePhone } from '../../integrations/futurix-sms';
import { tenantFeatures } from '../../core/auth';

type Db = TenantDb;
const D = Prisma.Decimal;
const qf = new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 3 });
const fmt = (v: Prisma.Decimal | number) => qf.format(Number(v));

export type Rule = {
  type: AlertType;
  enabled: boolean;
  sms: boolean;
  threshold: number | null;
  recipientRoleIds: string[];
};

/** Regras efectivas: linhas gravadas + valores por defeito para os tipos sem linha. */
export async function getRules(db: Db): Promise<Map<AlertType, Rule>> {
  const [rows, roles] = await Promise.all([
    db.alertRule.findMany(),
    db.role.findMany({
      where: { isSystem: true, name: { in: DEFAULT_ALERT_ROLES } },
      select: { id: true },
    }),
  ]);
  const defaultRoles = roles.map((r) => r.id);
  return new Map(
    (Object.keys(ALERT_DEFAULTS) as AlertType[]).map((type) => {
      const row = rows.find((r) => r.type === type);
      const d = ALERT_DEFAULTS[type];
      return [
        type,
        row
          ? {
              type,
              enabled: row.enabled,
              sms: row.sms,
              threshold: row.threshold == null ? null : Number(row.threshold),
              recipientRoleIds: row.recipientRoleIds,
            }
          : { type, ...d, recipientRoleIds: defaultRoles },
      ];
    }),
  );
}

type Raise = {
  type: AlertType;
  key: string;
  unitId?: string | null;
  message: string;
  data?: Prisma.InputJsonValue;
};

/** Abre o alerta se não houver um aberto com a mesma chave. Devolve o alerta criado ou null. */
export async function raise(db: Db, tenantId: string, a: Raise, rules?: Map<AlertType, Rule>) {
  const rule = (rules ?? (await getRules(db))).get(a.type)!;
  if (!rule.enabled) return null;
  if (await db.alert.findFirst({ where: { key: a.key, status: 'OPEN' } })) return null;

  let alert;
  try {
    alert = await db.alert.create({
      data: {
        type: a.type,
        key: a.key,
        unitId: a.unitId ?? null,
        message: a.message,
        data: a.data,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return null; // aberto em paralelo
    throw e;
  }

  const users = await db.user.findMany({
    where: {
      active: true,
      roleId: { in: rule.recipientRoleIds },
      ...(a.unitId && { OR: [{ allUnits: true }, { userUnits: { some: { unitId: a.unitId } } }] }),
    },
  });
  await db.notification.createMany({
    data: users.map((u) => ({ userId: u.id, alertId: alert.id, title: a.message })),
  });

  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  if (rule.sms && !tenant.smsDigest) {
    const { smsJob } = await import('./jobs');
    for (const u of users)
      await queueSms(
        db,
        tenantId,
        {
          userId: u.id,
          phone: u.phone,
          alertId: alert.id,
          message: `${tenant.name}: ${a.message}`,
        },
        smsJob,
      );
  }
  return alert;
}

/** Cria o registo do SMS e põe-no na fila (ou regista SKIPPED se não houver telefone válido). */
export async function queueSms(
  db: Db,
  tenantId: string,
  s: { userId: string; phone: string | null; alertId?: string; message: string },
  job: { enqueue: (d: { tenantId: string; smsLogId: string }) => Promise<void> },
) {
  const to = normalizePhone(s.phone);
  const log = await db.smsLog.create({
    data: {
      userId: s.userId,
      alertId: s.alertId,
      to: to ?? s.phone ?? '',
      message: s.message.slice(0, 459), // 3 SMS
      status: to ? 'QUEUED' : 'SKIPPED',
      error: to ? null : 'Utilizador sem telemóvel válido',
    },
  });
  if (to) await job.enqueue({ tenantId, smsLogId: log.id });
}

export async function resolveKeys(db: Db, keys: string[]) {
  if (keys.length)
    await db.alert.updateMany({
      where: { key: { in: keys }, status: 'OPEN' },
      data: { status: 'RESOLVED', resolvedAt: new Date() },
    });
}

/** Resolve os alertas abertos de um tipo cuja chave já não está activa. */
async function syncType(db: Db, type: AlertType, activeKeys: Set<string>) {
  const open = await db.alert.findMany({ where: { type, status: 'OPEN' }, select: { key: true } });
  await resolveKeys(
    db,
    open.map((a) => a.key).filter((k) => !activeKeys.has(k)),
  );
}

// ---------- Avaliadores ----------

/**
 * Mínimo, rotura e máximo para pares produto/local. Só produtos com limites definidos no local
 * (os limites dizem o que se controla em cada local).
 */
export async function evaluateStock(
  db: Db,
  tenantId: string,
  pairs: { productId: string; locationId: string }[],
) {
  if (!pairs.length) return;
  const where = { OR: pairs.map((p) => ({ productId: p.productId, locationId: p.locationId })) };
  const limits = await db.productLocationLimit.findMany({
    where,
    include: {
      product: { select: { name: true, active: true, stockUnit: { select: { symbol: true } } } },
      location: { select: { name: true, unitId: true, unit: { select: { name: true } } } },
    },
  });
  if (!limits.length) return;
  const balances = new Map(
    (
      await db.stockBalance.findMany({
        where: { OR: limits.map((l) => ({ productId: l.productId, locationId: l.locationId })) },
      })
    ).map((b) => [`${b.productId}|${b.locationId}`, b.qty]),
  );
  const rules = await getRules(db);
  const toResolve: string[] = [];
  for (const l of limits) {
    const id = `${l.productId}|${l.locationId}`;
    const qty = balances.get(id) ?? new D(0);
    const where = `${l.product.name} em ${l.location.unit.name} · ${l.location.name}`;
    const u = l.product.stockUnit.symbol;
    const state = {
      STOCK_OUT: l.product.active && qty.lte(0),
      STOCK_BELOW_MIN: l.product.active && l.minQty != null && qty.gt(0) && qty.lt(l.minQty),
      STOCK_ABOVE_MAX: l.product.active && l.maxQty != null && qty.gt(l.maxQty),
    } as const;
    const msg = {
      STOCK_OUT: `Rotura de stock: ${where} (${fmt(qty)} ${u})`,
      STOCK_BELOW_MIN: `Stock abaixo do mínimo: ${where}: ${fmt(qty)} ${u} (mín. ${fmt(l.minQty ?? 0)})`,
      STOCK_ABOVE_MAX: `Stock acima do máximo: ${where}: ${fmt(qty)} ${u} (máx. ${fmt(l.maxQty ?? 0)})`,
    };
    for (const type of Object.keys(state) as (keyof typeof state)[]) {
      const key = `${type}|${id}`;
      if (state[type])
        await raise(
          db,
          tenantId,
          {
            type,
            key,
            unitId: l.location.unitId,
            message: msg[type],
            data: { productId: l.productId, locationId: l.locationId, qty: qty.toString() },
          },
          rules,
        );
      else toResolve.push(key);
    }
  }
  await resolveKeys(db, toResolve);
}

/** Lotes com saldo cuja validade termina dentro do limiar (dias). */
export async function evaluateExpiry(db: Db, tenantId: string) {
  const rules = await getRules(db);
  const days = rules.get('EXPIRY_NEAR')!.threshold ?? 0;
  const limit = new Date(Date.now() + days * 86_400_000);
  const lots = await db.stockLotBalance.findMany({
    where: { qty: { gt: 0 }, lot: { expiryDate: { lte: limit } } },
    include: {
      lot: { select: { code: true, expiryDate: true } },
      product: { select: { name: true, stockUnit: { select: { symbol: true } } } },
      location: { select: { name: true, unitId: true, unit: { select: { name: true } } } },
    },
  });
  const active = new Set<string>();
  for (const lb of lots) {
    const key = `EXPIRY_NEAR|${lb.lotId}|${lb.locationId}`;
    active.add(key);
    const date = lb.lot.expiryDate!.toISOString().slice(0, 10).split('-').reverse().join('/');
    const expired = lb.lot.expiryDate! < new Date();
    await raise(
      db,
      tenantId,
      {
        type: 'EXPIRY_NEAR',
        key,
        unitId: lb.location.unitId,
        message: `${expired ? 'Validade expirada' : 'Validade próxima'}: ${lb.product.name} lote ${lb.lot.code} (${date}), ${fmt(lb.qty)} ${lb.product.stockUnit.symbol} em ${lb.location.unit.name} · ${lb.location.name}`,
      },
      rules,
    );
  }
  await syncType(db, 'EXPIRY_NEAR', active);
}

/** Desvios de inventário acima do limiar (%) no fecho de uma contagem. */
export async function evaluateInventory(db: Db, tenantId: string, countId: string) {
  const rules = await getRules(db);
  const pct = rules.get('INVENTORY_VARIANCE')!.threshold ?? 0;
  const c = await db.inventoryCount.findUniqueOrThrow({
    where: { id: countId },
    include: {
      location: { select: { name: true, unitId: true, unit: { select: { name: true } } } },
    },
  });
  const lines = await db.inventoryCountLine.findMany({
    where: { countId, countedQty: { not: null }, expectedQty: { not: null } },
    include: { product: { select: { name: true } } },
  });
  const over = lines
    .map((l) => {
      const exp = l.expectedQty!;
      const diff = l.countedQty!.sub(exp);
      const p = exp.isZero()
        ? diff.isZero()
          ? 0
          : Infinity
        : diff.div(exp).abs().mul(100).toNumber();
      return { name: l.product.name, p, diff };
    })
    .filter((x) => x.p > pct)
    .sort((a, b) => b.p - a.p);
  if (!over.length) return;
  const list = over
    .slice(0, 5)
    .map(
      (x) =>
        `${x.name} (${x.diff.gt(0) ? '+' : ''}${fmt(x.diff)}${Number.isFinite(x.p) ? `, ${Math.round(x.p)}%` : ''})`,
    )
    .join('; ');
  await raise(
    db,
    tenantId,
    {
      type: 'INVENTORY_VARIANCE',
      key: `INVENTORY_VARIANCE|${countId}`,
      unitId: c.location.unitId,
      message: `Inventário nº ${c.number} (${c.location.unit.name} · ${c.location.name}): ${over.length} produto(s) com desvio > ${pct}%: ${list}${over.length > 5 ? '…' : ''}`,
    },
    rules,
  );
}

/** Importações confirmadas com linhas por lançar (artigos POS sem mapeamento). */
export async function evaluatePosUnmapped(db: Db, tenantId: string) {
  const pending = await db.salesImportLine.groupBy({
    by: ['importId'],
    where: { postedAt: null, import: { status: 'CONFIRMED' } },
    _count: { _all: true },
  });
  const imports = await db.salesImport.findMany({
    where: { id: { in: pending.map((p) => p.importId) } },
    include: { unit: { select: { name: true } } },
  });
  const rules = await getRules(db);
  const active = new Set<string>();
  for (const imp of imports) {
    const codes = await db.salesImportLine.findMany({
      where: { importId: imp.id, postedAt: null },
      distinct: ['posCode'],
      select: { posCode: true },
    });
    const key = `POS_UNMAPPED|${imp.id}`;
    active.add(key);
    await raise(
      db,
      tenantId,
      {
        type: 'POS_UNMAPPED',
        key,
        unitId: imp.unitId,
        message: `Importação de vendas nº ${imp.number} (${imp.unit.name}): ${codes.length} artigo(s) POS por mapear`,
      },
      rules,
    );
  }
  await syncType(db, 'POS_UNMAPPED', active);
}

/** Dia anterior sem vendas importadas (só para tenants que importam vendas). */
export async function evaluateMissingImports(db: Db, tenantId: string, now = new Date()) {
  if (!(await db.importProfile.count({ where: { active: true } }))) return;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: env.TZ_DISPLAY }).format(now); // YYYY-MM-DD
  const y = new Date(`${today}T00:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  const day = y.toISOString().slice(0, 10);
  const units = await db.unit.findMany({ where: { active: true } });
  const rules = await getRules(db);
  const active = new Set<string>();
  for (const u of units) {
    const covered = await db.salesImport.count({
      where: {
        unitId: u.id,
        status: { in: ['READY', 'CONFIRMED'] },
        periodFrom: { lte: y },
        periodTo: { gte: y },
      },
    });
    if (covered) continue;
    const key = `SALES_IMPORT_MISSING|${u.id}|${day}`;
    active.add(key);
    await raise(
      db,
      tenantId,
      {
        type: 'SALES_IMPORT_MISSING',
        key,
        unitId: u.id,
        message: `Sem vendas importadas em ${u.name} no dia ${day.split('-').reverse().join('/')}`,
      },
      rules,
    );
  }
  // resolve dias entretanto importados (mantém os ainda em falta de dias anteriores)
  const open = await db.alert.findMany({ where: { type: 'SALES_IMPORT_MISSING', status: 'OPEN' } });
  for (const a of open) {
    if (active.has(a.key)) continue;
    const [, unitId, d] = a.key.split('|');
    const date = new Date(d!);
    const covered = await db.salesImport.count({
      where: {
        unitId,
        status: { in: ['READY', 'CONFIRMED'] },
        periodFrom: { lte: date },
        periodTo: { gte: date },
      },
    });
    if (covered) await resolveKeys(db, [a.key]);
  }
}

/** Contas a pagar a vencer (limiar em dias) e vencidas. */
export async function evaluatePayables(db: Db, tenantId: string, now = new Date()) {
  const rules = await getRules(db);
  const days = rules.get('PAYABLE_DUE')!.threshold ?? 0;
  const today = new Date(now.toISOString().slice(0, 10));
  const open = await db.payable.findMany({
    where: {
      status: { in: ['OPEN', 'PARTIAL'] },
      dueDate: { lte: new Date(today.getTime() + days * 86_400_000) },
    },
    include: { supplier: { select: { name: true } } },
  });
  const active = { due: new Set<string>(), overdue: new Set<string>() };
  const fmt = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');
  const kz = (v: number) => `${new Intl.NumberFormat('pt-AO').format(v)} Kz`;
  for (const p of open) {
    const overdue = p.dueDate < today;
    const type = overdue ? 'PAYABLE_OVERDUE' : 'PAYABLE_DUE';
    const key = `${type}|${p.id}`;
    (overdue ? active.overdue : active.due).add(key);
    const doc = p.documentNumber ? ` (${p.documentNumber})` : '';
    await raise(
      db,
      tenantId,
      {
        type,
        key,
        unitId: p.unitId,
        message: `${overdue ? 'Conta a pagar vencida' : 'Conta a pagar a vencer'}: ${p.supplier.name}${doc}, ${kz(p.amount - p.paidAmount)} em ${fmt(p.dueDate)}`,
      },
      rules,
    );
  }
  await syncType(db, 'PAYABLE_DUE', active.due);
  await syncType(db, 'PAYABLE_OVERDUE', active.overdue);
}

/** Varrimento completo de um tenant (job periódico). */
export async function sweepTenant(tenantId: string) {
  const db = tenantDb(tenantId);
  const limits = await db.productLocationLimit.findMany({
    select: { productId: true, locationId: true },
  });
  await evaluateStock(db, tenantId, limits);
  await evaluateExpiry(db, tenantId);
  await evaluatePosUnmapped(db, tenantId);
  await evaluateMissingImports(db, tenantId);
  if ((await tenantFeatures(tenantId)).has('payables')) await evaluatePayables(db, tenantId);
}
