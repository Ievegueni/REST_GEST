/**
 * Armazenamento de ficheiros (facturas, comprovativos, documentos RH).
 * Cloudinary via REST assinado; sem CLOUDINARY_URL em dev, grava em disco (.uploads/).
 * ponytail: ficheiros Cloudinary ficam em URL pública não adivinhável; mudar para
 * type=authenticated + URLs assinadas se os documentos RH o exigirem.
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../core/env';
import { AppError } from '../core/errors';

export const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const LOCAL_DIR = path.resolve(process.cwd(), '.uploads');

export type StoredFile = { url: string; name: string };

const safeName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[^\w.-]+/g, '_')
    .slice(-80);

export async function storeFile(
  tenantId: string,
  file: { buffer: Buffer; filename: string; mimetype: string },
): Promise<StoredFile> {
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    throw new AppError('VALIDATION_ERROR', 'Tipo de ficheiro não permitido (PDF, JPG, PNG, WEBP)');
  }
  if (env.CLOUDINARY_URL) return uploadCloudinary(tenantId, file);
  if (env.NODE_ENV === 'production')
    throw new AppError('INTERNAL_ERROR', 'Armazenamento não configurado');

  const name = `${randomBytes(8).toString('hex')}-${safeName(file.filename)}`;
  await mkdir(path.join(LOCAL_DIR, tenantId), { recursive: true });
  await writeFile(path.join(LOCAL_DIR, tenantId, name), file.buffer);
  return { url: `/api/files/${tenantId}/${name}`, name: file.filename };
}

/** Lê um ficheiro local (só dev). O nome é validado contra path traversal. */
export async function readLocalFile(tenantId: string, name: string) {
  if (!/^[\w.-]+$/.test(name) || !/^[\w]+$/.test(tenantId))
    throw new AppError('NOT_FOUND', 'Ficheiro não encontrado');
  try {
    return await readFile(path.join(LOCAL_DIR, tenantId, name));
  } catch {
    throw new AppError('NOT_FOUND', 'Ficheiro não encontrado');
  }
}

async function uploadCloudinary(
  tenantId: string,
  file: { buffer: Buffer; filename: string; mimetype: string },
) {
  const u = new URL(env.CLOUDINARY_URL!); // cloudinary://key:secret@cloud
  const [apiKey, apiSecret, cloud] = [u.username, u.password, u.hostname];
  const folder = `restgest/${tenantId}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHash('sha1')
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex');

  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
    file.filename,
  );
  form.append('api_key', apiKey);
  form.append('timestamp', timestamp);
  form.append('folder', folder);
  form.append('signature', signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/auto/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new AppError('INTERNAL_ERROR', 'Falha ao guardar o ficheiro');
  const json = (await res.json()) as { secure_url: string };
  return { url: json.secure_url, name: file.filename };
}
