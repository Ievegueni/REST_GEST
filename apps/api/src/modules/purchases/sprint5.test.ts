import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@restgest/shared';
import { buildApp } from '../../app';
import { prisma, tenantDb } from '../../core/prisma';
import { clientFor, createTestTenant, deleteTenants, multipart } from '../../test-utils';

const app = await buildApp();
let T: Awaited<ReturnType<typeof createTestTenant>>;
let db: ReturnType<typeof tenantDb>;
let api: Awaited<ReturnType<typeof clientFor>>;
let token = '';
const ids = { gf: '', cx: '', cat: '', store: '', bar: '', unit2: '', bar2: '', supplier: '' };
let seq = 0;

async function newProduct(opts: { tracksLots?: boolean } = {}) {
  const p = await db.product.create({
    data: {
      code: `S5-${++seq}`,
      name: `Produto ${seq}`,
      categoryId: ids.cat,
      stockUnitId: ids.gf,
      purchaseUnitId: ids.cx,
      tracksLots: opts.tracksLots ?? false,
    },
  });
  await db.productUnitConversion.create({ data: { productId: p.id, unitId: ids.cx, factor: 24 } });
  return p.id;
}
const qty = async (productId: string, locationId: string) =>
  (
    await db.stockBalance.findUnique({ where: { productId_locationId: { productId, locationId } } })
  )?.qty.toNumber() ?? 0;
const avg = async (productId: string, unitId: string) =>
  (
    await db.stockCost.findUnique({ where: { productId_unitId: { productId, unitId } } })
  )?.avgCost.toNumber();

beforeAll(async () => {
  T = await createTestTenant({ name: 'S5', perms: [...PERMISSIONS] });
  db = tenantDb(T.tenant.id);
  ids.gf = (await db.measureUnit.create({ data: { name: 'Garrafa', symbol: 'gf' } })).id;
  ids.cx = (await db.measureUnit.create({ data: { name: 'Caixa', symbol: 'cx' } })).id;
  ids.cat = (await db.category.create({ data: { name: 'Bebidas' } })).id;
  ids.store = (await db.stockLocation.create({ data: { unitId: T.unit.id, name: 'Armazém' } })).id;
  ids.bar = (await db.stockLocation.create({ data: { unitId: T.unit.id, name: 'Bar' } })).id;
  ids.unit2 = (await db.unit.create({ data: { name: 'Unidade 2' } })).id;
  ids.bar2 = (await db.stockLocation.create({ data: { unitId: ids.unit2, name: 'Bar 2' } })).id;
  ids.supplier = (await db.supplier.create({ data: { name: 'Distribuidora' } })).id;
  api = await clientFor(app, T.email);
  token = (
    await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: T.email, password: 'password123' },
    })
  ).json().data.accessToken;
});

afterAll(async () => {
  await deleteTenants([T.tenant.id]);
  await app.close();
  await prisma.$disconnect();
});

describe('encomendas e recepções', () => {
  let p = '';
  let order: { id: string; number: number; lines: { id: string }[] };

  it('cria encomenda numerada e só edita em rascunho', async () => {
    p = await newProduct();
    const body = {
      supplierId: ids.supplier,
      unitId: T.unit.id,
      lines: [{ productId: p, unitId: ids.cx, qty: 10, unitPrice: 4800 }],
    };
    order = (await api('POST', '/api/purchase-orders', body)).json().data;
    const second = (await api('POST', '/api/purchase-orders', body)).json().data;
    expect(second.number).toBe(order.number + 1);
    expect(
      (await api('POST', `/api/purchase-orders/${order.id}/status`, { status: 'SENT' })).json().data
        .status,
    ).toBe('SENT');
    expect((await api('PUT', `/api/purchase-orders/${order.id}`, body)).statusCode).toBe(400);
  });

  const receive = (qtyCx: number, unitPrice = 4800, locationId = ids.store) =>
    api('POST', '/api/goods-receipts', {
      supplierId: ids.supplier,
      locationId,
      orderId: order.id,
      invoiceNumber: 'FT 1/2026',
      lines: [
        { productId: p, orderLineId: order.lines[0]!.id, unitId: ids.cx, qty: qtyCx, unitPrice },
      ],
    });

  it('recepção parcial: entra em stock, encomenda fica PARCIAL, preço do fornecedor actualizado', async () => {
    const res = await receive(4);
    expect(res.statusCode).toBe(201);
    expect(res.json().data.totalAmount).toBe(19200);
    expect(await qty(p, ids.store)).toBe(96);
    expect(await avg(p, T.unit.id)).toBe(200);
    expect((await api('GET', `/api/purchase-orders/${order.id}`)).json().data.status).toBe(
      'PARTIAL',
    );
    const sp = await db.supplierProduct.findFirstOrThrow({ where: { productId: p } });
    expect(sp.lastPrice).toBe(4800); // por caixa (unidade de compra)
  });

  it('local fora da unidade da encomenda → 400', async () => {
    expect((await receive(1, 4800, ids.bar2)).statusCode).toBe(400);
  });

  it('segunda recepção completa a encomenda e muda o custo médio', async () => {
    const r = (await receive(6, 7200)).json().data;
    expect((await api('GET', `/api/purchase-orders/${order.id}`)).json().data.status).toBe(
      'RECEIVED',
    );
    expect(await avg(p, T.unit.id)).toBe(260); // (96×200 + 144×300) / 240

    // Anular devolve o stock, o custo anterior e o estado da encomenda
    const cancelled = await api('POST', `/api/goods-receipts/${r.id}/cancel`);
    expect(cancelled.json().data.status).toBe('CANCELLED');
    expect(await qty(p, ids.store)).toBe(96);
    expect(await avg(p, T.unit.id)).toBe(200);
    expect((await api('GET', `/api/purchase-orders/${order.id}`)).json().data.status).toBe(
      'PARTIAL',
    );
    expect((await api('POST', `/api/goods-receipts/${r.id}/cancel`)).statusCode).toBe(400);
  });

  it('movimentos da recepção não se estornam à mão', async () => {
    const m = await db.stockMovement.findFirstOrThrow({
      where: { productId: p, refType: 'GoodsReceipt' },
    });
    expect((await api('POST', `/api/stock/movements/${m.id}/reverse`)).statusCode).toBe(400);
  });
});

describe('transferências', () => {
  it('converte para unidade de stock, sai ao custo médio e entra no destino com diferenças registadas', async () => {
    const p = await newProduct();
    await api('POST', '/api/stock/movements', {
      locationId: ids.store,
      items: [{ productId: p, type: 'PURCHASE_IN', qty: 2, unitId: ids.cx, unitCost: 6000 }],
    });
    const t = (
      await api('POST', '/api/transfers', {
        fromLocationId: ids.store,
        toLocationId: ids.bar2,
        lines: [{ productId: p, qty: 1, unitId: ids.cx }],
      })
    ).json().data;
    expect(t.lines[0].qty).toBe('24');
    expect(t.status).toBe('PENDING');

    const sent = (await api('POST', `/api/transfers/${t.id}/send`)).json().data;
    expect(sent.lines[0].unitCost).toBe('250');
    expect(await qty(p, ids.store)).toBe(24);

    expect(
      (
        await api('POST', `/api/transfers/${t.id}/receive`, {
          lines: [{ lineId: t.lines[0].id, receivedQty: 30 }],
        })
      ).statusCode,
    ).toBe(400);
    const rec = (
      await api('POST', `/api/transfers/${t.id}/receive`, {
        lines: [{ lineId: t.lines[0].id, receivedQty: 22 }],
      })
    ).json().data;
    expect(rec.status).toBe('RECEIVED');
    expect(rec.lines[0]).toMatchObject({ sentQty: '24', receivedQty: '22' });
    expect(await qty(p, ids.bar2)).toBe(22);
    expect(await avg(p, ids.unit2)).toBe(250); // outra unidade recebe ao custo de saída
  });

  it('mantém os lotes no destino', async () => {
    const p = await newProduct({ tracksLots: true });
    await api('POST', '/api/stock/movements', {
      locationId: ids.store,
      items: [
        {
          productId: p,
          type: 'PURCHASE_IN',
          qty: 5,
          unitCost: 100,
          lotCode: 'L1',
          expiryDate: '2027-01-01',
        },
      ],
    });
    const t = (
      await api('POST', '/api/transfers', {
        fromLocationId: ids.store,
        toLocationId: ids.bar,
        lines: [{ productId: p, qty: 3 }],
      })
    ).json().data;
    await api('POST', `/api/transfers/${t.id}/send`);
    await api('POST', `/api/transfers/${t.id}/receive`, {
      lines: [{ lineId: t.lines[0].id, receivedQty: 3 }],
    });
    const lb = await db.stockLotBalance.findMany({
      where: { productId: p },
      include: { lot: true },
    });
    expect(
      lb
        .map((x) => [x.locationId === ids.bar ? 'bar' : 'store', x.lot.code, x.qty.toNumber()])
        .sort(),
    ).toEqual([
      ['bar', 'L1', 3],
      ['store', 'L1', 2],
    ]);
  });

  it('cancelar uma transferência enviada devolve o stock à origem', async () => {
    const p = await newProduct();
    await api('POST', '/api/stock/movements', {
      locationId: ids.store,
      items: [{ productId: p, type: 'PURCHASE_IN', qty: 10, unitCost: 10 }],
    });
    const t = (
      await api('POST', '/api/transfers', {
        fromLocationId: ids.store,
        toLocationId: ids.bar,
        lines: [{ productId: p, qty: 4 }],
      })
    ).json().data;
    await api('POST', `/api/transfers/${t.id}/send`);
    expect(await qty(p, ids.store)).toBe(6);
    expect((await api('POST', `/api/transfers/${t.id}/cancel`)).json().data.status).toBe(
      'CANCELLED',
    );
    expect(await qty(p, ids.store)).toBe(10);
  });

  it('origem igual ao destino → 400', async () => {
    const p = await newProduct();
    expect(
      (
        await api('POST', '/api/transfers', {
          fromLocationId: ids.bar,
          toLocationId: ids.bar,
          lines: [{ productId: p, qty: 1 }],
        })
      ).statusCode,
    ).toBe(400);
  });
});

describe('inventário', () => {
  it('abre, bloqueia movimentos, acerta o contado e ignora não contados', async () => {
    const [a, b] = [await newProduct(), await newProduct()];
    await api('POST', '/api/stock/movements', {
      locationId: ids.bar,
      items: [
        { productId: a, type: 'PURCHASE_IN', qty: 10, unitCost: 100 },
        { productId: b, type: 'PURCHASE_IN', qty: 5, unitCost: 100 },
      ],
    });
    const c = (
      await api('POST', '/api/inventory-counts', { locationId: ids.bar, blocksMovements: true })
    ).json().data;
    expect(c.lines.map((l: { productId: string }) => l.productId)).toEqual(
      expect.arrayContaining([a, b]),
    );
    expect((await api('POST', '/api/inventory-counts', { locationId: ids.bar })).statusCode).toBe(
      409,
    );

    const blocked = await api('POST', '/api/stock/movements', {
      locationId: ids.bar,
      items: [{ productId: a, type: 'CONSUMPTION', qty: 1 }],
    });
    expect(blocked.statusCode).toBe(409);

    const counted = (
      await api('PUT', `/api/inventory-counts/${c.id}/lines`, {
        lines: [{ productId: a, countedQty: 7 }],
      })
    ).json().data;
    const la = counted.lines.find((l: { productId: string }) => l.productId === a);
    expect(la).toMatchObject({ countedQty: '7', expectedQty: '10' });

    const closed = (await api('POST', `/api/inventory-counts/${c.id}/close`)).json().data;
    expect(closed.status).toBe('CLOSED');
    expect(await qty(a, ids.bar)).toBe(7);
    expect(await qty(b, ids.bar)).toBe(5); // não contado
    const adj = await db.stockMovement.findFirstOrThrow({
      where: { productId: a, type: 'INVENTORY_ADJUST' },
    });
    expect([adj.qty.toNumber(), adj.totalCost]).toEqual([-3, -300]);

    // depois de fechada, o local volta a aceitar movimentos
    const ok = await api('POST', '/api/stock/movements', {
      locationId: ids.bar,
      items: [{ productId: a, type: 'CONSUMPTION', qty: 1 }],
    });
    expect(ok.statusCode).toBe(201);
  });
});

describe('anexos', () => {
  const upload = (name: string, type: string, content = Buffer.from('%PDF-1.4 teste')) => {
    const body = multipart(name, content, type);
    return app.inject({
      method: 'POST',
      url: '/api/uploads',
      payload: body.payload,
      headers: { ...body.headers, authorization: `Bearer ${token}` },
    });
  };

  it('guarda PDF e só o próprio tenant o lê', async () => {
    const res = await upload('factura.pdf', 'application/pdf');
    expect(res.statusCode).toBe(201);
    const { url, name } = res.json().data;
    expect(name).toBe('factura.pdf');
    const file = await app.inject({ url, headers: { authorization: `Bearer ${token}` } });
    expect(file.body).toBe('%PDF-1.4 teste');

    const other = await createTestTenant({ name: 'S5other' });
    const otherApi = await clientFor(app, other.email);
    expect((await otherApi('GET', url)).statusCode).toBe(404);
    await deleteTenants([other.tenant.id]);
  });

  it('rejeita tipos não permitidos', async () => {
    expect((await upload('x.exe', 'application/x-msdownload')).statusCode).toBe(400);
  });
});
