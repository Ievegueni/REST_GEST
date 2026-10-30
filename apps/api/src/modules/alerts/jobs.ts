import { env } from '../../core/env';
import { prisma, tenantDb } from '../../core/prisma';
import { tenantFeatures } from '../../core/auth';
import { sendSms } from '../../integrations/futurix-sms';
import { defineJob } from '../../jobs/queue';
import { evaluateStock, getRules, queueSms, sweepTenant } from './engine';

/** Minutos desde a meia-noite no fuso de apresentação. */
function localMinutes(now: Date, tz: string) {
  const [h, m] = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(now)
    .split(':')
    .map(Number);
  return h! * 60 + m!;
}
const toMin = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h! * 60 + (m ?? 0);
};

/** Se `now` está no horário de silêncio, devolve os ms até ao fim; senão 0. Suporta janelas que passam a meia-noite. */
export function quietDelay(
  now: Date,
  start: string | null,
  end: string | null,
  tz = env.TZ_DISPLAY,
) {
  if (!start || !end) return 0;
  const n = localMinutes(now, tz);
  const [s, e] = [toMin(start), toMin(end)];
  const inside = s <= e ? n >= s && n < e : n >= s || n < e;
  if (!inside) return 0;
  const minutes = (e - n + 1440) % 1440;
  return minutes * 60_000;
}

export const smsJob = defineJob<{ tenantId: string; smsLogId: string }>(
  'sms-send',
  async ({ tenantId, smsLogId }) => {
    const db = tenantDb(tenantId);
    const log = await db.smsLog.findUnique({ where: { id: smsLogId } });
    if (!log || log.status !== 'QUEUED') return;
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });

    const delay = quietDelay(new Date(), tenant.smsQuietStart, tenant.smsQuietEnd);
    if (delay > 0)
      return void (await smsJob.enqueue(
        { tenantId, smsLogId },
        { delay, jobId: `sms-${smsLogId}-${Date.now()}` },
      ));

    if (tenant.smsMonthlyLimit != null) {
      const monthStart = new Date(new Date().toISOString().slice(0, 8) + '01T00:00:00Z');
      const sent = await db.smsLog.count({
        where: { status: 'SENT', sentAt: { gte: monthStart } },
      });
      if (sent >= tenant.smsMonthlyLimit) {
        return void (await db.smsLog.update({
          where: { id: smsLogId },
          data: { status: 'SKIPPED', error: 'Limite mensal de SMS do plano atingido' },
        }));
      }
    }

    const res = await sendSms(log.to, log.message);
    const attempts = log.attempts + 1;
    if (res.ok) {
      await db.smsLog.update({
        where: { id: smsLogId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          providerId: res.providerId,
          cost: res.cost,
          attempts,
        },
      });
    } else if (res.retryable && attempts < 3) {
      await db.smsLog.update({ where: { id: smsLogId }, data: { attempts, error: res.error } });
      throw new Error(res.error); // BullMQ tenta de novo
    } else {
      await db.smsLog.update({
        where: { id: smsLogId },
        data: { status: res.retryable ? 'FAILED' : 'SKIPPED', attempts, error: res.error },
      });
    }
  },
);

/** Verificação de mínimos/máximos depois de movimentos (agendada com atraso para correr após o commit). */
export const stockCheckJob = defineJob<{
  tenantId: string;
  pairs: { productId: string; locationId: string }[];
}>(
  'alerts-stock-check',
  async ({ tenantId, pairs }) => {
    if (!(await tenantFeatures(tenantId)).has('alerts_sms')) return;
    await evaluateStock(tenantDb(tenantId), tenantId, pairs);
  },
  { inlineInTests: false },
);

const activeTenants = async () =>
  (await prisma.tenant.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })).map(
    (t) => t.id,
  );

export const sweepJob = defineJob<object>(
  'alerts-sweep',
  async () => {
    for (const id of await activeTenants()) {
      if ((await tenantFeatures(id)).has('alerts_sms')) await sweepTenant(id);
    }
  },
  { inlineInTests: false, every: { pattern: '*/30 * * * *' } },
);

/** Resumo diário por SMS para tenants com smsDigest: alertas abertos nas últimas 24 h. */
export async function sendDigest(tenantId: string) {
  const db = tenantDb(tenantId);
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  if (!tenant.smsDigest) return;
  const since = new Date(Date.now() - 86_400_000);
  const rules = await getRules(db);
  const smsTypes = [...rules.values()].filter((r) => r.enabled && r.sms).map((r) => r.type);
  const alerts = await db.alert.findMany({
    where: { status: 'OPEN', createdAt: { gte: since }, type: { in: smsTypes } },
  });
  if (!alerts.length) return;
  const roleIds = [...new Set(smsTypes.flatMap((t) => rules.get(t)!.recipientRoleIds))];
  const users = await db.user.findMany({
    where: { active: true, roleId: { in: roleIds } },
    include: { userUnits: true },
  });
  for (const u of users) {
    const mine = alerts.filter(
      (a) => u.allUnits || !a.unitId || u.userUnits.some((x) => x.unitId === a.unitId),
    );
    if (!mine.length) continue;
    const message = `${tenant.name}: ${mine.length} alerta(s) nas últimas 24h. ${mine
      .slice(0, 3)
      .map((a) => a.message)
      .join(' | ')}`;
    await queueSms(db, tenantId, { userId: u.id, phone: u.phone, message }, smsJob);
  }
}

export const digestJob = defineJob<object>(
  'alerts-digest',
  async () => {
    for (const id of await activeTenants()) {
      if ((await tenantFeatures(id)).has('alerts_sms')) await sendDigest(id);
    }
  },
  { inlineInTests: false, every: { pattern: '0 8 * * *' } },
);
