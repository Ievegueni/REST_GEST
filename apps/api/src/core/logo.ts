/** Logotipo do tenant (PNG/JPEG, os formatos que os PDF aceitam): validação pelo conteúdo, gravação na BD e URL pública com versão. */
import { audit } from './audit';
import { AppError } from './errors';
import { prisma } from './prisma';

const MAX = 512 * 1024;

/** Tipo real pelos primeiros bytes (não confiar no nome nem no content-type enviado). */
export function sniffImage(buf: Buffer): 'image/png' | 'image/jpeg' | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

export const logoUrl = (t: { id: string; logoUpdatedAt: Date | null }) =>
  t.logoUpdatedAt ? `/api/tenant-logo/${t.id}?v=${t.logoUpdatedAt.getTime()}` : null;

/** buf = novo logotipo; null = remover. */
export async function setTenantLogo(
  tenantId: string,
  buf: Buffer | null,
  actor: { userId?: string; adminId?: string; ip?: string },
) {
  let mime: string | null = null;
  if (buf) {
    if (buf.length > MAX) throw new AppError('VALIDATION_ERROR', 'Logotipo acima de 512 KB');
    mime = sniffImage(buf);
    if (!mime) throw new AppError('VALIDATION_ERROR', 'Use uma imagem PNG ou JPG');
  }
  const t = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      logoData: buf ? new Uint8Array(buf) : null,
      logoMime: mime,
      logoUpdatedAt: buf ? new Date() : null,
    },
    select: { id: true, logoUpdatedAt: true },
  });
  await audit({
    tenantId,
    userId: actor.adminId ?? actor.userId ?? null,
    action: buf ? 'tenant.logo.set' : 'tenant.logo.remove',
    entity: 'Tenant',
    entityId: tenantId,
    after: buf ? { mime, bytes: buf.length } : undefined,
    ip: actor.ip,
  });
  return { logoUrl: logoUrl(t) };
}

/** Para os PDF (data URL; pdfmake aceita PNG e JPEG). */
export async function logoDataUrl(tenantId: string) {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { logoData: true, logoMime: true },
  });
  if (!t?.logoData || !t.logoMime) return null;
  return `data:${t.logoMime};base64,${Buffer.from(t.logoData).toString('base64')}`;
}
