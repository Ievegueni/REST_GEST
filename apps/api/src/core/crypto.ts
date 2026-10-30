/** Encriptação de campos sensíveis (IBAN…) com AES-256-GCM. Chave de 32 bytes em ENCRYPTION_KEY (base64 ou hex). */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from './env';
import { AppError } from './errors';

function key() {
  const raw = env.ENCRYPTION_KEY;
  const buf =
    raw && (/^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64'));
  if (!buf || buf.length !== 32)
    throw new AppError('INTERNAL_ERROR', 'ENCRYPTION_KEY em falta ou inválida (32 bytes)');
  return buf;
}

/** "v1:iv:tag:dados" em base64. */
export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [
    'v1',
    iv.toString('base64'),
    c.getAuthTag().toString('base64'),
    data.toString('base64'),
  ].join(':');
}

export function decrypt(payload: string) {
  const [v, iv, tag, data] = payload.split(':');
  if (v !== 'v1' || !iv || !tag || !data)
    throw new AppError('INTERNAL_ERROR', 'Formato cifrado inválido');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
}
