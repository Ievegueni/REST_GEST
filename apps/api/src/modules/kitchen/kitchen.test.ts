import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { prisma } from '../../core/prisma';
import { clientFor, createTestTenant, deleteTenants } from '../../test-utils';

const app = await buildApp();
let A: Awaited<ReturnType<typeof createTestTenant>>;
let S: Awaited<ReturnType<typeof createTestTenant>>;
let api: Awaited<ReturnType<typeof clientFor>>;
let key = '';

const line = (id: string, over: object = {}) => ({
  id,
  docId: 'D6',
  round: 'R1',
  zone: 'Cozinha',
  table: '6',
  code: '23',
  label: 'Franguinho Palace',
  qty: 2,
  position: Number(id.slice(1)),
  ...over,
});
const sync = (lines: object[], k = key) =>
  app.inject({
    method: 'POST',
    url: '/api/pos-agent/kitchen',
    headers: { 'x-agent-key': k },
    payload: { lines },
  });
type Board = {
  tickets: {
    id: string;
    status: string;
    table: string;
    items: { label: string; cancelled: boolean }[];
  }[];
  ready: { id: string }[];
  zones: string[];
  warnMinutes: number;
};
const board = async (zone = 'Cozinha') =>
  (await api('GET', `/api/kitchen/tickets?unitId=${A.unit.id}&zone=${zone}`)).json().data as Board;

beforeAll(async () => {
  A = await createTestTenant({
    name: 'Kds',
    plan: 'COMPLETO',
    perms: ['kitchen.manage', 'units.manage', 'reports.view'],
  });
  S = await createTestTenant({ name: 'KdsS', plan: 'STOCK', perms: ['kitchen.manage'] });
  api = await clientFor(app, A.email);
  key = (await api('POST', `/api/units/${A.unit.id}/pos-agent-key`)).json().data.key;
});

afterAll(async () => {
  await deleteTenants([A.tenant.id, S.tenant.id]);
  await app.close();
  await prisma.$disconnect();
});

describe('ecrã de cozinha', () => {
  it('ronda nova do POS → talão por zona', async () => {
    const res = await sync([
      line('L1'),
      line('L2', { code: '252', label: 'Choco Grelhado', qty: 1 }),
      line('L3', { zone: 'Bar', code: '65', label: 'Ginger Ale', qty: 1 }),
    ]);
    expect(res.json().data).toEqual({ created: 2, closed: 0 });
    const b = await board();
    expect(b.tickets).toHaveLength(1);
    expect(b.tickets[0]).toMatchObject({ status: 'NEW', table: '6' });
    expect(b.tickets[0]!.items.map((i) => i.label)).toEqual([
      'Franguinho Palace',
      'Choco Grelhado',
    ]);
    expect(b.zones).toEqual(['Bar', 'Cozinha']);
    expect(b.warnMinutes).toBe(10);
    // fotografia repetida não duplica
    expect(
      (
        await sync([
          line('L1'),
          line('L2', { label: 'Choco Grelhado', qty: 1 }),
          line('L3', { zone: 'Bar' }),
        ])
      ).json().data,
    ).toEqual({ created: 0, closed: 0 });
  });

  it('artigo anulado no POS (ou que saiu da conta) fica riscado', async () => {
    await sync([line('L1', { cancelled: true }), line('L3', { zone: 'Bar' })]);
    const items = (await board()).tickets[0]!.items;
    expect(items.map((i) => i.cancelled)).toEqual([true, true]);
  });

  it('Novo → Em produção → Pronto (sai do ecrã) → recuperar', async () => {
    const id = (await board()).tickets[0]!.id;
    const go = (status: string) => api('POST', `/api/kitchen/tickets/${id}/status`, { status });
    expect((await go('IN_PROGRESS')).json().data.startedAt).toBeTruthy();
    expect((await go('READY')).json().data.readyAt).toBeTruthy();
    let b = await board();
    expect(b.tickets).toHaveLength(0);
    expect(b.ready.map((t) => t.id)).toEqual([id]);
    await go('IN_PROGRESS');
    b = await board();
    expect(b.tickets[0]).toMatchObject({ id, status: 'IN_PROGRESS' });
  });

  it('mesa fechada no POS → talões saem do ecrã', async () => {
    expect((await sync([])).json().data.closed).toBe(2);
    expect((await board()).tickets).toHaveLength(0);
    expect((await board('Bar')).tickets).toHaveLength(0);
  });

  it('relatório de tempos: espera, preparação e total por prato', async () => {
    const t = await prisma.kitchenTicket.findFirstOrThrow({
      where: { tenantId: A.tenant.id, zone: 'Cozinha' },
    });
    // o Choco volta a contar; o Franguinho (L1) continua anulado
    await prisma.kitchenItem.updateMany({
      where: { ticketId: t.id, posLineId: 'L2' },
      data: { cancelled: false },
    });
    const at = (m: number) => new Date(Date.UTC(2026, 10, 3, 12, m));
    await prisma.kitchenTicket.update({
      where: { id: t.id },
      data: { status: 'READY', seenAt: at(0), startedAt: at(4), readyAt: at(16) },
    });
    const r = (await api('GET', '/api/reports/kitchen-times?from=2026-11-03&to=2026-11-03')).json()
      .data;
    expect(r.rows).toEqual([
      {
        zone: 'Cozinha',
        item: 'Choco Grelhado',
        tickets: 1,
        wait: 4,
        prep: 12,
        total: 16,
        max: 16,
      },
    ]);
    expect(r.totals).toMatchObject({ tickets: 1, total: 16 });
  });

  it('plano STOCK não tem ecrã de cozinha', async () => {
    const other = await clientFor(app, S.email);
    const res = await other('GET', `/api/kitchen/tickets?unitId=${S.unit.id}`);
    expect(res.json().error.code).toBe('FEATURE_NOT_IN_PLAN');
  });
});
