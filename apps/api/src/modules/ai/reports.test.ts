import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@restgest/shared';
import { buildApp } from '../../app';
import { prisma, tenantDb } from '../../core/prisma';
import { setAiMessagesForTests, type AiMessages } from '../../integrations/anthropic';
import { clientFor, createTestTenant, deleteTenants } from '../../test-utils';
import { addDays, todayLocal } from '../reports/common';
import { zScore } from './anomalies';
import { runAnomalies, runWeekly } from './reports';

describe('zScore', () => {
  it('desvio face ao histórico; sem variação ou poucos dados = null', () => {
    const h = [10, 12, 8, 10, 12, 8, 10, 12, 8, 10];
    expect(zScore(h, 10)!.z).toBeCloseTo(0);
    expect(zScore(h, 30)!.z).toBeGreaterThan(5);
    expect(zScore([5, 5, 5, 5, 5, 5, 5, 5], 9)).toBeNull();
    expect(zScore([0, 0, 0, 0, 3, 4], 9)).toBeNull();
  });
});

const app = await buildApp();
let T: Awaited<ReturnType<typeof createTestTenant>>;
let db: ReturnType<typeof tenantDb>;
const day = addDays(todayLocal(), -1);

function fake(script: { stop: string; content: object[] }[]) {
  let i = 0;
  setAiMessagesForTests({
    create: async () => ({
      ...script[Math.min(i++, script.length - 1)]!,
      stop_reason: script[Math.min(i - 1, script.length - 1)]!.stop,
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
  } as unknown as AiMessages);
}
const text = (t: string) => ({ stop: 'end_turn', content: [{ type: 'text', text: t }] });

beforeAll(async () => {
  T = await createTestTenant({ name: 'AiRep', plan: 'COMPLETO', perms: [...PERMISSIONS] });
  db = tenantDb(T.tenant.id);
  const cat = await db.costCategory.create({ data: { name: 'Energia' } });
  // 28 dias de custos ~10 000 e um pico de 60 000 ontem
  const data = Array.from({ length: 28 }, (_, i) => ({
    unitId: T.unit.id,
    categoryId: cat.id,
    date: new Date(addDays(day, -28 + i)),
    amount: 10_000 + (i % 3) * 500,
    createdById: T.user.id,
  }));
  data.push({ ...data[0]!, date: new Date(day), amount: 60_000 });
  await db.dailyCost.createMany({ data });
});
afterEach(() => setAiMessagesForTests());
afterAll(async () => {
  await deleteTenants([T.tenant.id]);
  await app.close();
});

describe('anomalias', () => {
  it('sem IA configurada: relatório com a lista calculada e alerta por unidade', async () => {
    const [r] = await runAnomalies(T.tenant.id, day);
    expect(r).toMatchObject({ kind: 'ANOMALIES', unitId: T.unit.id });
    expect(r!.content).toContain('Custos operacionais');
    const alert = await db.alert.findFirstOrThrow({ where: { type: 'AI_ANOMALY' } });
    expect(alert.unitId).toBe(T.unit.id);
  });

  it('com IA: explicação da IA; reprocessar actualiza o mesmo relatório', async () => {
    fake([text('**Custos** muito acima do normal.')]);
    await runAnomalies(T.tenant.id, day);
    const reports = await db.aiReport.findMany({ where: { kind: 'ANOMALIES' } });
    expect(reports).toHaveLength(1);
    expect(reports[0]!.content).toBe('**Custos** muito acima do normal.');
    expect(await db.alert.count({ where: { type: 'AI_ANOMALY' } })).toBe(1);
    expect(await db.aiRequest.count({ where: { kind: 'ANOMALIES' } })).toBe(1);
  });

  it('regra desligada → não corre', async () => {
    const before = await db.aiReport.count();
    await db.alertRule.upsert({
      where: { tenantId_type: { tenantId: T.tenant.id, type: 'AI_ANOMALY' } },
      update: { enabled: false },
      create: { type: 'AI_ANOMALY', enabled: false },
    });
    expect(await runAnomalies(T.tenant.id, addDays(day, -1))).toEqual([]);
    expect(await db.aiReport.count()).toBe(before);
  });
});

describe('relatório semanal', () => {
  it('sem IA não gera; com IA usa ferramentas, grava e notifica', async () => {
    expect(await runWeekly(T.tenant.id)).toEqual([]);
    fake([
      {
        stop: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'get_daily_costs', input: {} }],
      },
      text('## Resumo\nSemana com custos altos.\n- Rever energia'),
    ]);
    const [r] = await runWeekly(T.tenant.id, '2026-10-19');
    expect(r).toMatchObject({ kind: 'WEEKLY', unitId: T.unit.id });
    expect(r!.periodTo.toISOString().slice(0, 10)).toBe('2026-10-25');
    const n = await db.notification.findFirstOrThrow({
      where: { userId: T.user.id, title: { startsWith: 'Relatório semanal' } },
    });
    expect(n.body).toContain('custos altos');

    const api = await clientFor(app, T.email);
    const list = await api('GET', '/api/ai/reports?kind=WEEKLY');
    expect(list.json().data[0]).toMatchObject({ id: r!.id, unit: T.unit.name });
    const pdf = await api('GET', `/api/ai/reports/${r!.id}/pdf`);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('utilizador sem acesso à unidade não vê o relatório', async () => {
    const other = await db.unit.create({ data: { name: 'Outra' } });
    const u = await db.user.create({
      data: {
        email: `rep-restrito-${T.tenant.id}@test.local`,
        name: 'R',
        roleId: T.role.id,
        allUnits: false,
        passwordHash: (await prisma.user.findUniqueOrThrow({ where: { id: T.user.id } }))
          .passwordHash,
        userUnits: { create: { unitId: other.id } },
      },
    });
    const api = await clientFor(app, u.email);
    expect((await api('GET', '/api/ai/reports')).json().data).toEqual([]);
    const id = (await db.aiReport.findFirstOrThrow()).id;
    expect((await api('GET', `/api/ai/reports/${id}`)).statusCode).toBe(404);
  });
});
