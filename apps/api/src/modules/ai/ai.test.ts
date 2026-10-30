import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@restgest/shared';
import { buildApp } from '../../app';
import { prisma, tenantDb } from '../../core/prisma';
import { setAiMessagesForTests, type AiMessages } from '../../integrations/anthropic';
import { clientFor, createTestTenant, deleteTenants } from '../../test-utils';

const app = await buildApp();
let A: Awaited<ReturnType<typeof createTestTenant>>;
let B: Awaited<ReturnType<typeof createTestTenant>>;
let S: Awaited<ReturnType<typeof createTestTenant>>;
let api: Awaited<ReturnType<typeof clientFor>>;

type Block = Record<string, unknown>;
/** Cliente falso: devolve as respostas por ordem e guarda os pedidos. */
function fake(script: { stop: string; content: Block[] }[]) {
  const calls: { messages: { role: string; content: unknown }[]; tools?: { name: string }[] }[] =
    [];
  const create = async (params: never) => {
    calls.push(structuredClone(params));
    const r = script[calls.length - 1]!;
    return {
      stop_reason: r.stop,
      content: r.content,
      usage: { input_tokens: 1000, output_tokens: 200 },
    };
  };
  setAiMessagesForTests({ create } as unknown as AiMessages);
  return calls;
}
const toolUse = (id: string, name: string, input: object) => ({
  stop: 'tool_use',
  content: [{ type: 'tool_use', id, name, input }],
});
const text = (t: string) => ({ stop: 'end_turn', content: [{ type: 'text', text: t }] });
const ask = (q: string) =>
  api('POST', '/api/ai/chat', { messages: [{ role: 'user', content: q }] });

beforeAll(async () => {
  A = await createTestTenant({ name: 'AiA', plan: 'COMPLETO', perms: [...PERMISSIONS] });
  B = await createTestTenant({ name: 'AiB', plan: 'COMPLETO', perms: [...PERMISSIONS] });
  S = await createTestTenant({ name: 'AiS', plan: 'STOCK', perms: [...PERMISSIONS] });
  api = await clientFor(app, A.email);
});
afterEach(() => setAiMessagesForTests());
afterAll(async () => {
  await deleteTenants([A.tenant.id, B.tenant.id, S.tenant.id]);
  await app.close();
});

describe('Analisador IA — chat', () => {
  it('plano STOCK não tem acesso', async () => {
    fake([text('x')]);
    const s = await clientFor(app, S.email);
    const res = await s('POST', '/api/ai/chat', { messages: [{ role: 'user', content: 'olá' }] });
    expect(res.json().error.code).toBe('FEATURE_NOT_IN_PLAN');
  });

  it('ciclo de ferramentas, gráfico e registo do pedido', async () => {
    const calls = fake([
      toolUse('t1', 'get_stock_summary', { unitId: A.unit.id }),
      toolUse('t2', 'show_chart', {
        kind: 'bar',
        title: 'Stock',
        labels: ['x'],
        series: [{ name: 'Valor', values: [0] }],
      }),
      text('O stock está vazio.'),
    ]);
    const res = await ask('Quanto tenho em stock?');
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      answer: 'O stock está vazio.',
      charts: [{ kind: 'bar', title: 'Stock' }],
    });
    // o contexto e as ferramentas do plano chegam ao modelo
    expect(calls[0]!.tools!.map((t) => t.name)).toContain('get_financial_result');
    const result = calls[1]!.messages.at(-1)!.content as Block[];
    expect(result[0]).toMatchObject({ type: 'tool_result', tool_use_id: 't1', is_error: false });
    expect(String(result[0]!.content)).toContain('Stock actual');

    const reqs = await prisma.aiRequest.findMany({ where: { tenantId: A.tenant.id } });
    expect(reqs).toHaveLength(1);
    expect(reqs[0]).toMatchObject({
      kind: 'CHAT',
      inputTokens: 3000,
      outputTokens: 600,
      toolCalls: 2,
      ok: true,
      promptVersion: 'chat-v1',
    });
  });

  it('a ferramenta não acede a unidades de outro tenant nem fora do acesso do utilizador', async () => {
    // utilizador de A só com acesso a uma segunda unidade
    const db = tenantDb(A.tenant.id);
    const other = await db.unit.create({ data: { name: 'Outra' } });
    const u = await db.user.create({
      data: {
        email: `restrito-${A.tenant.id}@test.local`,
        name: 'Restrito',
        roleId: A.role.id,
        allUnits: false,
        passwordHash: (await prisma.user.findUniqueOrThrow({ where: { id: A.user.id } }))
          .passwordHash,
        userUnits: { create: { unitId: other.id } },
      },
    });
    const restricted = await clientFor(app, u.email);
    for (const unitId of [B.unit.id, A.unit.id]) {
      const calls = fake([toolUse('t1', 'get_consumption', { unitId }), text('Sem acesso.')]);
      const res = await restricted('POST', '/api/ai/chat', {
        messages: [{ role: 'user', content: 'consumo?' }],
      });
      expect(res.statusCode).toBe(200);
      const result = (calls[1]!.messages.at(-1)!.content as Block[])[0]!;
      expect(result.is_error).toBe(true);
    }
    // o contexto só lista a unidade acessível
    const calls = fake([text('ok')]);
    await restricted('POST', '/api/ai/chat', { messages: [{ role: 'user', content: 'x' }] });
    const system = JSON.stringify((calls[0] as unknown as { system: unknown }).system);
    expect(system).toContain(other.id);
    expect(system).not.toContain(A.unit.id);
  });

  it('parâmetros inválidos voltam como erro ao modelo', async () => {
    const calls = fake([toolUse('t1', 'get_waste', { from: 'ontem' }), text('ok')]);
    await ask('quebras?');
    expect((calls[1]!.messages.at(-1)!.content as Block[])[0]!.is_error).toBe(true);
  });

  it('limite mensal de pedidos', async () => {
    const used = await prisma.aiRequest.count({ where: { tenantId: A.tenant.id } });
    await prisma.tenant.update({ where: { id: A.tenant.id }, data: { aiMonthlyLimit: used } });
    fake([text('x')]);
    const res = await ask('olá');
    expect(res.statusCode).toBe(429);
    const status = await api('GET', '/api/ai/status');
    expect(status.json().data).toMatchObject({ configured: true, used, limit: used });
    await prisma.tenant.update({ where: { id: A.tenant.id }, data: { aiMonthlyLimit: null } });
  });

  it('erro da API fica registado e devolve mensagem genérica', async () => {
    setAiMessagesForTests({
      create: async () => {
        throw new Error('overloaded');
      },
    } as unknown as AiMessages);
    const res = await ask('olá');
    expect(res.statusCode).toBe(500);
    const last = await prisma.aiRequest.findFirst({
      where: { tenantId: A.tenant.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(last).toMatchObject({ ok: false, error: 'overloaded' });
  });
});
