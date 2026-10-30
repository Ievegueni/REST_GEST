/**
 * Cliente Futurix SMS.
 * ponytail: formato do pedido assumido (POST JSON, Bearer) até haver documentação/credenciais da Futurix;
 * só este ficheiro muda quando chegarem.
 */
import { env } from '../core/env';

export type SmsResult =
  | { ok: true; providerId: string | null; cost: number | null }
  | { ok: false; error: string; retryable: boolean };

export const smsConfigured = () => Boolean(env.FUTURIX_SMS_API_KEY && env.FUTURIX_SMS_SENDER);

export async function sendSms(to: string, message: string): Promise<SmsResult> {
  if (!smsConfigured())
    return { ok: false, error: 'Futurix SMS não configurado', retryable: false };
  try {
    const res = await fetch(`${env.FUTURIX_SMS_API_URL}/sms/send`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.FUTURIX_SMS_API_KEY}`,
      },
      body: JSON.stringify({ to, message, sender: env.FUTURIX_SMS_SENDER }),
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
