import type Anthropic from '@anthropic-ai/sdk';
import type { AiRequestKind } from '@prisma/client';
import type { AuthContext } from '../../core/auth';
import { env } from '../../core/env';
import { AppError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import {
  aiConfigured,
  aiMessages,
  costMicroUsd,
  fallbackParams,
} from '../../integrations/anthropic';
import { todayLocal, zonedMidnight } from '../reports/common';
import { CHAT_PROMPT } from './prompts';
import { runTool, toolParams, type Chart } from './tools';

const MAX_TURNS = 8;

/** Pedidos deste mês (fuso de apresentação) vs. limite contratado. */
export async function aiUsage(tenantId: string) {
  const [tenant, used] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { aiMonthlyLimit: true } }),
    prisma.aiRequest.count({
      where: { tenantId, createdAt: { gte: zonedMidnight(`${todayLocal().slice(0, 8)}01`) } },
    }),
  ]);
  return { used, limit: tenant.aiMonthlyLimit };
}

export async function assertAiAvailable(tenantId: string) {
  if (!aiConfigured()) throw new AppError('FORBIDDEN', 'Analisador IA não configurado no servidor');
  const { used, limit } = await aiUsage(tenantId);
  if (limit != null && used >= limit)
    throw new AppError('RATE_LIMITED', 'Limite mensal de pedidos ao Analisador IA atingido', {
      used,
      limit,
    });
}

type LoopInput = {
  tenantId: string;
  userId: string | null;
  kind: AiRequestKind;
  promptVersion: string;
  system: Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  /** sem auth = sem ferramentas */
  auth?: AuthContext;
};

/** Ciclo de tool use; regista um AiRequest com os tokens somados de todas as voltas. */
export async function runLoop(input: LoopInput) {
  const model = env.ANTHROPIC_MODEL;
  const tools = input.auth ? toolParams(input.auth) : [];
  const messages = [...input.messages];
  const charts: Chart[] = [];
  const usage = { input: 0, output: 0, toolCalls: 0 };
  let answer = '';
  let error: string | undefined;

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const res = await aiMessages().create({
        model,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        system: input.system,
        messages,
        ...(tools.length && { tools }),
        ...fallbackParams(model),
      });
      usage.input +=
        res.usage.input_tokens +
        (res.usage.cache_read_input_tokens ?? 0) +
        (res.usage.cache_creation_input_tokens ?? 0);
      usage.output += res.usage.output_tokens;

      if (res.stop_reason === 'refusal') {
        answer = 'Não posso responder a este pedido.';
        break;
      }
      messages.push({ role: 'assistant', content: res.content });
      const calls = res.content.filter(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
      );
      if (res.stop_reason !== 'tool_use' || !calls.length || !input.auth) {
        answer = res.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        break;
      }
      usage.toolCalls += calls.length;
      const auth = input.auth;
      const results = await Promise.all(
        calls.map(async (c): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          const r = await runTool(auth, c.name, c.input, charts);
          return { type: 'tool_result', tool_use_id: c.id, content: r.content, is_error: r.error };
        }),
      );
      messages.push({ role: 'user', content: results });
    }
    if (!answer) answer = 'Não consegui concluir a análise. Tente reformular a pergunta.';
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  await prisma.aiRequest.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      kind: input.kind,
      model,
      promptVersion: input.promptVersion,
      inputTokens: usage.input,
      outputTokens: usage.output,
      costMicroUsd: costMicroUsd(model, usage.input, usage.output),
      toolCalls: usage.toolCalls,
      ok: !error,
      error: error?.slice(0, 1000),
    },
  });
  if (error) throw new AppError('INTERNAL_ERROR', 'O Analisador IA não respondeu. Tente de novo.');
  return { answer, charts };
}

/** Contexto variável (data, unidades, categorias) num bloco à parte do prompt fixo. */
async function context(auth: AuthContext) {
  const [units, cats] = await Promise.all([
    auth.db.unit.findMany({
      where: { active: true, ...(auth.unitIds !== 'all' && { id: { in: auth.unitIds } }) },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    auth.db.category.findMany({
      select: { id: true, name: true, parent: { select: { name: true } } },
      orderBy: { name: 'asc' },
      take: 300,
    }),
  ]);
  return [
    `Hoje: ${todayLocal()} (fuso ${env.TZ_DISPLAY}).`,
    `Unidades a que o utilizador tem acesso: ${units.map((u) => `${u.name} (id ${u.id})`).join('; ') || 'nenhuma'}.`,
    `Categorias de produtos: ${cats.map((c) => `${c.parent ? `${c.parent.name} > ` : ''}${c.name} (id ${c.id})`).join('; ') || 'nenhuma'}.`,
  ].join('\n');
}

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export async function chat(auth: AuthContext, history: ChatTurn[]) {
  await assertAiAvailable(auth.tenantId);
  return runLoop({
    tenantId: auth.tenantId,
    userId: auth.userId,
    kind: 'CHAT',
    promptVersion: CHAT_PROMPT.version,
    auth,
    system: [
      { type: 'text', text: CHAT_PROMPT.text },
      { type: 'text', text: await context(auth) },
    ],
    messages: history,
  });
}
