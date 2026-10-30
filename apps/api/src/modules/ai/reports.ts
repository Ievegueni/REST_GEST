/** Relatórios automáticos da IA: anomalias (diário) e relatório semanal por unidade. */
import { systemAuth, tenantFeatures } from '../../core/auth';
import { prisma, tenantDb } from '../../core/prisma';
import { defineJob } from '../../jobs/queue';
import { getRules, raise } from '../alerts/engine';
import { addDays, todayLocal } from '../reports/common';
import { detectAnomalies, type Anomaly } from './anomalies';
import { ANOMALY_PROMPT, WEEKLY_PROMPT } from './prompts';
import { assertAiAvailable, context, runLoop } from './service';

const fmt = (n: number) => new Intl.NumberFormat('pt-AO').format(n);

/** Texto simples quando a IA não está disponível (sem chave ou limite atingido). */
const plainAnomalies = (list: Anomaly[]) =>
  list
    .map(
      (a) =>
        `- **${a.unit}** — ${a.label}: ${fmt(a.value)} Kz (média ${fmt(a.mean)} Kz, z = ${a.z})`,
    )
    .join('\n');

async function aiAvailable(tenantId: string) {
  try {
    await assertAiAvailable(tenantId);
    return true;
  } catch {
    return false;
  }
}

async function saveReport(
  tenantId: string,
  r: {
    kind: 'ANOMALIES' | 'WEEKLY';
    unitId: string | null;
    from: string;
    to: string;
    content: string;
    data: object;
  },
) {
  const db = tenantDb(tenantId);
  const key = { kind: r.kind, unitId: r.unitId, periodFrom: new Date(r.from) };
  const data = { ...key, periodTo: new Date(r.to), content: r.content, data: r.data };
  // findFirst + update: o unique com unitId null não impede duplicados no Postgres
  const existing = await db.aiReport.findFirst({ where: key });
  return existing
    ? db.aiReport.update({ where: { id: existing.id }, data })
    : db.aiReport.create({ data });
}

/** Anomalias de um dia (por defeito ontem): relatório e alerta por unidade com anomalias. */
export async function runAnomalies(tenantId: string, day = addDays(todayLocal(), -1)) {
  const auth = await systemAuth(tenantId);
  const rule = (await getRules(auth.db)).get('AI_ANOMALY')!;
  if (!rule.enabled) return [];
  const anomalies = await detectAnomalies(auth, day, rule.threshold ?? 3);
  if (!anomalies.length) return [];

  const reports = [];
  for (const unitId of new Set(anomalies.map((a) => a.unitId))) {
    const list = anomalies.filter((a) => a.unitId === unitId);
    let content = plainAnomalies(list);
    if (await aiAvailable(tenantId)) {
      const r = await runLoop({
        tenantId,
        userId: null,
        kind: 'ANOMALIES',
        promptVersion: ANOMALY_PROMPT.version,
        system: [{ type: 'text', text: ANOMALY_PROMPT.text }],
        messages: [
          {
            role: 'user',
            content: `Anomalias de ${day} na unidade ${list[0]!.unit}:\n${JSON.stringify(list.map(({ unitId: _u, ...a }) => a))}`,
          },
        ],
      }).catch(() => null);
      if (r?.answer) content = r.answer;
    }
    const report = await saveReport(tenantId, {
      kind: 'ANOMALIES',
      unitId,
      from: day,
      to: day,
      content,
      data: { anomalies: list },
    });
    reports.push(report);
    await raise(auth.db, tenantId, {
      type: 'AI_ANOMALY',
      key: `AI_ANOMALY|${unitId}|${day}`,
      unitId,
      message: `${list[0]!.unit}: ${list.length} anomalia(s) em ${day} — ${list.map((a) => a.label).join(', ')}`,
      data: { reportId: report.id },
    });
  }
  return reports;
}

/** Relatório semanal (segunda a domingo) de cada unidade activa; notifica quem tem ai.use. */
export async function runWeekly(tenantId: string, weekStart?: string) {
  if (!(await aiAvailable(tenantId))) return [];
  const today = todayLocal();
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = segunda
  const from = weekStart ?? addDays(today, -dow - 7);
  const to = addDays(from, 6);
  const db = tenantDb(tenantId);
  const units = await db.unit.findMany({
    where: { active: true },
    select: { id: true, name: true },
  });
  const out = [];

  for (const u of units) {
    if (!(await aiAvailable(tenantId))) break;
    const auth = await systemAuth(tenantId, [u.id]);
    const r = await runLoop({
      tenantId,
      userId: null,
      kind: 'WEEKLY_REPORT',
      promptVersion: WEEKLY_PROMPT.version,
      auth,
      system: [
        { type: 'text', text: WEEKLY_PROMPT.text },
        { type: 'text', text: await context(auth) },
      ],
      messages: [
        {
          role: 'user',
          content: `Relatório semanal da unidade ${u.name} (id ${u.id}): semana de ${from} a ${to}. Semana anterior: ${addDays(from, -7)} a ${addDays(from, -1)}.`,
        },
      ],
    }).catch(() => null);
    if (!r) continue;
    const report = await saveReport(tenantId, {
      kind: 'WEEKLY',
      unitId: u.id,
      from,
      to,
      content: r.answer,
      data: { unit: u.name, charts: r.charts },
    });
    out.push(report);

    const users = await db.user.findMany({
      where: {
        active: true,
        role: { permissions: { some: { code: 'ai.use' } } },
        OR: [{ allUnits: true }, { userUnits: { some: { unitId: u.id } } }],
      },
      select: { id: true },
    });
    await db.notification.createMany({
      data: users.map((x) => ({
        userId: x.id,
        title: `Relatório semanal IA: ${u.name} (${from} a ${to})`,
        body: r.answer.slice(0, 300),
      })),
    });
  }
  return out;
}

const aiTenants = async () => {
  const ts = await prisma.tenant.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
  const out = [];
  for (const t of ts) if ((await tenantFeatures(t.id)).has('ai_analyzer')) out.push(t.id);
  return out;
};

export const anomaliesJob = defineJob<object>(
  'ai-anomalies',
  async () => {
    for (const id of await aiTenants()) await runAnomalies(id);
  },
  { inlineInTests: false, every: { pattern: '30 6 * * *' } },
);

export const weeklyReportJob = defineJob<object>(
  'ai-weekly-report',
  async () => {
    for (const id of await aiTenants()) await runWeekly(id);
  },
  { inlineInTests: false, every: { pattern: '0 7 * * 1' } },
);
