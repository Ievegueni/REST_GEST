import Anthropic from '@anthropic-ai/sdk';
import { env } from '../core/env';

export type AiMessages = Pick<Anthropic['beta']['messages'], 'create'>;

let client: Anthropic | undefined;
let override: AiMessages | undefined;

export const aiConfigured = () => Boolean(override || env.ANTHROPIC_API_KEY);

export function aiMessages(): AiMessages {
  if (override) return override;
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client.beta.messages;
}

/** Testes: substitui o cliente (undefined = repõe o real). */
export function setAiMessagesForTests(fake?: AiMessages) {
  override = fake;
}

/** Preço público por 1M tokens (USD) — só para estimar custo; modelo desconhecido = 0. */
const PRICES: Record<string, [input: number, output: number]> = {
  'claude-opus-5': [5, 25],
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-4-5': [1, 5],
  'claude-fable-5-1': [10, 50],
};

export function costMicroUsd(model: string, input: number, output: number) {
  const [i, o] = PRICES[model] ?? [0, 0];
  return Math.round(input * i + output * o); // tokens × USD/1M = micro-USD
}

/** Fallback no servidor quando o classificador do modelo recusa (só nos modelos que o suportam). */
export const fallbackParams = (model: string) =>
  model === 'claude-opus-5'
    ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
    : {};
