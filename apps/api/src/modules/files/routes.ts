import type { FastifyInstance } from 'fastify';
import { protect } from '../../core/auth';
import { AppError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { readLocalFile, storeFile } from '../../integrations/storage';

export async function fileRoutes(app: FastifyInstance) {
  app.post('/uploads', protect(), async (req, reply) => {
    const file = await req.file();
    if (!file) throw new AppError('VALIDATION_ERROR', 'Ficheiro em falta');
    const stored = await storeFile(req.auth.tenantId, {
      buffer: await file.toBuffer(),
      filename: file.filename,
      mimetype: file.mimetype,
    });
    return reply.status(201).send({ data: stored });
  });

  /** Ficheiros locais (dev). Só o próprio tenant. */
  app.get<{ Params: { tenantId: string; name: string } }>(
    '/files/:tenantId/:name',
    protect(),
    async (req, reply) => {
      if (req.params.tenantId !== req.auth.tenantId)
        throw new AppError('NOT_FOUND', 'Ficheiro não encontrado');
      const buf = await readLocalFile(req.params.tenantId, req.params.name);
      const ext = req.params.name.split('.').pop()?.toLowerCase();
      const type =
        ext === 'pdf'
          ? 'application/pdf'
          : ext === 'png'
            ? 'image/png'
            : ext === 'webp'
              ? 'image/webp'
              : 'image/jpeg';
      return reply.header('content-type', type).send(buf);
    },
  );

  /** Logotipo do tenant: público (vai em <img> e não é dado sensível); o URL leva a versão. */
  app.get<{ Params: { tenantId: string } }>('/tenant-logo/:tenantId', async (req, reply) => {
    const t = await prisma.tenant.findUnique({
      where: { id: req.params.tenantId },
      select: { logoData: true, logoMime: true },
    });
    if (!t?.logoData || !t.logoMime) throw new AppError('NOT_FOUND', 'Sem logotipo');
    return reply
      .header('content-type', t.logoMime)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('cross-origin-resource-policy', 'cross-origin')
      .send(Buffer.from(t.logoData));
  });
}
