/**
 * Cliente Futurix SMS.
 * ponytail: formato do pedido assumido (POST JSON, Bearer) até haver documentação/credenciais da Futurix;
 * só este ficheiro muda quando chegarem.
 */
import { env } from '../core/env';
import { getSetting } from '../core/platform-settings';

export type SmsResult =
  | { ok: true; providerId: string | null; cost: number | null }
  | { ok: false; error: string; retryable: boolean };

export const FUTURIX_KEYS = {
  url: 'futurix.apiUrl',
  apiKey: 'futurix.apiKey',
  sender: 'futurix.sender',
} as const;

/** Configuração em uso: a do Super Admin (Integrações) tem prioridade sobre o .env. */
export async function futurixConfig() {
  const [url, apiKey, sender] = await Promise.all([
    getSetting(FUTURIX_KEYS.url),
    getSetting(FUTURIX_KEYS.apiKey),
    getSetting(FUTURIX_KEYS.sender),
  ]);
  return {
    url: url ?? env.FUTURIX_SMS_API_URL,
    apiKey: apiKey ?? env.FUTURIX_SMS_API_KEY,
    sender: sender ?? env.FUTURIX_SMS_SENDER,
    source: apiKey ? ('platform' as const) : env.FUTURIX_SMS_API_KEY ? ('env' as const) : null,
  };
}

export const smsConfigured = async () => {
  const c = await futurixConfig();
  return Boolean(c.apiKey && c.sender);
};

export async function sendSms(to: string, message: string): Promise<SmsResult> {
  const cfg = await futurixConfig();
  if (!cfg.apiKey || !cfg.sender)
    return { ok: false, error: 'Futurix SMS não configurado', retryable: false };
  try {
    const res = await fetch(`${cfg.url.replace(/\/+$/, '')}/sms/send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ to, message, sender: cfg.sender }),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      cost?: number;
      message?: string;
    };
    if (!res.ok)
      return {
        ok: false,
        error: json.message ?? `HTTP ${res.status}`,
        retryable: res.status >= 500,
      };
    return { ok: true, providerId: json.id ?? null, cost: json.cost ?? null };
  } catch (e) {
    return { ok: false, error: (e as Error).message, retryable: true };
  }
}

/** Normaliza para formato internacional angolano (+244). */
export function normalizePhone(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/\D/g, '');
  if (/^244\d{9}$/.test(d)) return `+${d}`;
  if (/^9\d{8}$/.test(d)) return `+244${d}`;
  return null;
}
