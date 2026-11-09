import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app';
import { prisma } from '../../core/prisma';
import { clientFor, createTestTenant, deleteTenants } from '../../test-utils';

const app = await buildApp();
let A: Awaited<ReturnType<typeof createTestTenant>>;
let B: Awaited<ReturnType<typeof createTestTenant>>;
let api: Awaited<ReturnType<typeof clientFor>>;
let other: Awaited<ReturnType<typeof clientFor>>;
const ids = { t1: '', t2: '', res: '' };

beforeAll(async () => {
  // reservas existem nos dois planos: STOCK chega
  A = await createTestTenant({ name: 'ResA', perms: ['reservations.manage', 'units.manage'] });
  B = await createTestTenant({ name: 'ResB', perms: ['stock.view'] });
  api = await clientFor(app, A.email);
  other = await clientFor(app, B.email);
});

afterAll(async () => {
  await deleteTenants([A.tenant.id, B.tenant.id]);
  await app.close();
  await prisma.$disconnect();
});

describe('reservas', () => {
  it('cria mesas', async () => {
    const t1 = await api('POST', '/api/tables', {
      unitId: A.unit.id,
      name: 'M1',
      seats: 4,
      area: 'Sala',
    });
    expect(t1.statusCode).toBe(201);
    ids.t1 = t1.json().data.id;
    ids.t2 = (
      await api('POST', '/api/tables', { unitId: A.unit.id, name: 'M2', seats: 2 })
    ).json().data.id;
  });

  it('cria mesas por intervalo sem duplicar', async () => {
    const body = { unitId: A.unit.id, from: 101, to: 105, seats: 4, area: 'Lounge' };
    expect((await api('POST', '/api/tables/range', body)).json().data.created).toBe(5);
    expect((await api('POST', '/api/tables/range', { ...body, to: 106 })).json().data.created).toBe(
      1,
    );
    expect(
      (await api('POST', '/api/tables/range', { ...body, from: 110, to: 101 })).statusCode,
    ).toBe(400);
  });

  it('reserva → sentar → mesa ocupada → libertar', async () => {
    const r = await api('POST', '/api/reservations', {
      unitId: A.unit.id,
      customerName: 'Ana',
      phone: '923000000',
      partySize: 3,
      startsAt: new Date().toISOString(),
    });
    expect(r.statusCode).toBe(201);
    ids.res = r.json().data.id;
    expect(r.json().data.status).toBe('BOOKED');

    const seat = await api('PATCH', `/api/reservations/${ids.res}`, {
      status: 'SEATED',
      tableId: ids.t1,
    });
    expect(seat.statusCode).toBe(200);
    expect(seat.json().data.seatedAt).toBeTruthy();

    // walk-in na mesma mesa: ocupada
    const walk = {
      unitId: A.unit.id,
      customerName: 'Sem reserva',
      partySize: 2,
      startsAt: new Date().toISOString(),
      walkIn: true,
    };
    expect((await api('POST', '/api/reservations', { ...walk, tableId: ids.t1 })).statusCode).toBe(
      409,
    );
    expect((await api('POST', '/api/reservations', walk)).statusCode).toBe(400); // sem mesa
    const w = await api('POST', '/api/reservations', { ...walk, tableId: ids.t2 });
    expect(w.json().data.status).toBe('SEATED');

    const board = (await api('GET', `/api/reservations/board?unitId=${A.unit.id}`)).json().data;
    expect(board.tables).toHaveLength(8); // M1, M2 + 101..106
    expect(
      board.reservations.filter((x: { status: string }) => x.status === 'SEATED'),
    ).toHaveLength(2);

    const done = await api('PATCH', `/api/reservations/${ids.res}`, { status: 'DONE' });
    expect(done.json().data.closedAt).toBeTruthy();
    expect((await api('POST', '/api/reservations', { ...walk, tableId: ids.t1 })).statusCode).toBe(
      201,
    );
  });

  it('mesa de outra unidade é recusada', async () => {
    const u2 = await prisma.unit.create({ data: { tenantId: A.tenant.id, name: 'Outra' } });
    const res = await api('POST', '/api/reservations', {
      unitId: u2.id,
      tableId: ids.t1,
      customerName: 'X',
      partySize: 2,
      startsAt: new Date().toISOString(),
    });
    expect(res.statusCode).toBe(400);
  });

  it('isolamento: outro tenant não vê nem altera', async () => {
    await prisma.role.update({
      where: { id: B.role.id },
      data: { permissions: { connect: { code: 'reservations.manage' } } },
    });
    const board = await other('GET', `/api/reservations/board?unitId=${A.unit.id}`);
    expect(board.statusCode === 403 || board.json().data.reservations.length === 0).toBe(true);
    expect(
      (await other('PATCH', `/api/reservations/${ids.res}`, { status: 'CANCELLED' })).statusCode,
    ).toBe(404);
    expect((await other('PATCH', `/api/tables/${ids.t1}`, { name: 'hack' })).statusCode).toBe(404);
  });

  it('agente POS: chave por unidade e sincronização das mesas abertas', async () => {
    const key = (await api('POST', `/api/units/${A.unit.id}/pos-agent-key`)).json().data.key;
    expect(key).toMatch(/^rga_/);
    expect((await api('GET', '/api/units')).json().data[0]).not.toHaveProperty('posAgentKeyHash');
    const sync = (open: string[], k = key) =>
      app.inject({
        method: 'POST',
        url: '/api/pos-agent/tables',
        headers: { 'x-agent-key': k },
        payload: { open },
      });
    expect((await sync([], 'rga_errada')).statusCode).toBe(401);

    // estado: M1 sentada (walk-in manual, ainda não vista no POS), M2 livre
    const seated = async () =>
      (await api('GET', `/api/reservations/board?unitId=${A.unit.id}`))
        .json()
        .data.reservations.filter((r: { status: string }) => r.status === 'SEATED')
        .map((r: { tableId: string }) => r.tableId)
        .sort();
    for (const r of (await api('GET', `/api/reservations/board?unitId=${A.unit.id}`)).json().data
      .reservations)
      if (r.status === 'SEATED')
        await api('PATCH', `/api/reservations/${r.id}`, { status: 'DONE' });
    await api('PATCH', `/api/reservations/${ids.res}`, { status: 'SEATED', tableId: ids.t1 });

    // POS ainda sem mesas abertas: a M1 sentada à mão não é libertada
    expect((await sync([])).json().data).toEqual({ opened: 0, closed: 0, unknown: [] });
    expect(await seated()).toEqual([ids.t1]);

    // POS abre M1 e M2 (+ mesa que não existe aqui)
    expect((await sync(['M1', 'M2', 'X9'])).json().data).toEqual({
      opened: 1,
      closed: 0,
      unknown: ['X9'],
    });
    expect(await seated()).toEqual([ids.t1, ids.t2].sort());
    expect((await sync(['M1', 'M2'])).json().data.opened).toBe(0); // idempotente

    // POS fecha M1: liberta
    expect((await sync(['M2'])).json().data).toEqual({ opened: 0, closed: 1, unknown: [] });
    expect(await seated()).toEqual([ids.t2]);

    // chave de A não mexe noutro tenant
    const bTable = await prisma.diningTable.create({
      data: { tenantId: B.tenant.id, unitId: B.unit.id, name: 'M1', seats: 2 },
    });
    await sync(['M1', 'M2']);
    expect(await prisma.reservation.count({ where: { tableId: bTable.id } })).toBe(0);
  });

  it('sem permissão ou sem feature → 403', async () => {
    await prisma.role.update({
      where: { id: B.role.id },
      data: { permissions: { disconnect: { code: 'reservations.manage' } } },
    });
    expect((await other('GET', `/api/tables?unitId=${B.unit.id}`)).statusCode).toBe(403);
    await prisma.tenant.update({
      where: { id: A.tenant.id },
      data: { featureOverrides: { reservations: false } },
    });
    const off = await api('GET', `/api/tables?unitId=${A.unit.id}`);
    expect(off.json().error.code).toBe('FEATURE_NOT_IN_PLAN');
  });
});
