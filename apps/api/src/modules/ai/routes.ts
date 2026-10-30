import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { canAccessUnit, protect } from '../../core/auth';
import { AppError } from '../../core/errors';
import { prisma } from '../../core/prisma';
import { aiConfigured } from '../../integrations/anthropic';
import { renderPdf } from '../reports/export';
import { runAnomalies, runWeekly } from './reports';
import { aiUsage, chat } from './service';

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(30)
    .refine((m) => m[0]!.role === 'user' && m.at(-1)!.role === 'user', {
      message: 'A conversa tem de começar e acabar numa pergunta',
    }),
});

export async function aiRoutes(app: FastifyInstance) {
  const use = protect({ feature: 'ai_analyzer', permission: 'ai.use' });

  app.get('/ai/status', use, async (req) => ({
    data: { configured: aiConfigured(), ...(await aiUsage(req.auth.tenantId)) },
  }));

  app.post(
    '/ai/chat',
    { ...use, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req) => ({
      data: await chat(req.auth, chatSchema.parse(req.body).messages),
    }),
  );

  // ---- Relatórios automáticos (anomalias, semanal)
  const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const visible = (auth: Parameters<typeof canAccessUnit>[0]) =>
    auth.unitIds === 'all' ? {} : { unitId: { in: auth.unitIds } };

  app.get('/ai/reports', use, async (req) => {
    const q = z.object({ kind: z.enum(['ANOMALIES', 'WEEKLY']).optional() }).parse(req.query);
    const rows = await req.auth.db.aiReport.findMany({
      where: { ...visible(req.auth), ...(q.kind && { kind: q.kind }) },
      select: {
        id: true,
        kind: true,
        unitId: true,
        periodFrom: true,
        periodTo: true,
        createdAt: true,
      },
      orderBy: [{ periodFrom: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    const units = await req.auth.db.unit.findMany({ select: { id: true, name: true } });
    return {
      data: rows.map((r) => ({ ...r, unit: units.find((u) => u.id === r.unitId)?.name ?? null })),
    };
  });

  const find = async (auth: Parameters<typeof canAccessUnit>[0], id: string) => {
    const r = await auth.db.aiReport.findFirst({ where: { id, ...visible(auth) } });
    if (!r) throw new AppError('NOT_FOUND', 'Relatório não encontrado');
    return r;
  };

  app.get<{ Params: { id: string } }>('/ai/reports/:id', use, async (req) => ({
    data: await find(req.auth, req.params.id),
  }));

  app.get<{ Params: { id: string } }>('/ai/reports/:id/pdf', use, async (req, reply) => {
    const r = await find(req.auth, req.params.id);
    const [tenant, unit] = await Promise.all([
      prisma.tenant.findUniqueOrThrow({ where: { id: req.auth.tenantId }, select: { name: true } }),
      r.unitId ? req.auth.db.unit.findFirst({ where: { id: r.unitId } }) : null,
    ]);
    const d = (x: Date) => x.toISOString().slice(0, 10);
    const title = r.kind === 'WEEKLY' ? 'Relatório semanal' : 'Anomalias detectadas';
    return reply
      .header('content-type', 'application/pdf')
      .header(
        'content-disposition',
        `attachment; filename="ia-${r.kind.toLowerCase()}-${d(r.periodFrom)}.pdf"`,
      )
      .send(
        await renderPdf({
          pageSize: 'A4',
          pageMargins: [40, 50, 40, 50],
          defaultStyle: { font: 'Helvetica', fontSize: 10 },
          header: { text: tenant.name, margin: [40, 20, 40, 0], fontSize: 8, color: '#666666' },
          content: [
            { text: title, fontSize: 16, bold: true },
            {
              text: `${unit?.name ?? 'Todas as unidades'} · ${d(r.periodFrom)}${r.periodTo > r.periodFrom ? ` a ${d(r.periodTo)}` : ''}`,
              margin: [0, 2, 0, 12],
              color: '#444444',
            },
            ...markdownToPdf(r.content),
            {
              text: 'Gerado automaticamente pelo Analisador IA.',
              margin: [0, 16, 0, 0],
              fontSize: 8,
              italics: true,
              color: '#666666',
            },
          ],
        }),
      );
  });

  /** Gerar agora (testes e reprocessamento). */
  const manage = protect({ feature: 'ai_analyzer', permission: 'settings.manage' });
  app.post('/ai/reports/run', manage, async (req) => {
    const b = z
      .object({ kind: z.enum(['ANOMALIES', 'WEEKLY']), from: day.optional() })
      .parse(req.body);
    const reports =
      b.kind === 'ANOMALIES'
        ? await runAnomalies(req.auth.tenantId, b.from)
        : await runWeekly(req.auth.tenantId, b.from);
    return { data: { created: reports.length } };
  });
}

/** Markdown simples (títulos, listas, **negrito**) → conteúdo pdfmake. */
function markdownToPdf(md: string) {
  const inline = (s: string) =>
    s
      .split(/(\*\*[^*]+\*\*)/)
      .filter(Boolean)
      .map((p) => (p.startsWith('**') ? { text: p.slice(2, -2), bold: true } : { text: p }));
  const out: object[] = [];
  let list: object[] = [];
  const flush = () => {
    if (list.length) out.push({ ul: list, margin: [0, 0, 0, 6] });
    list = [];
  };
  for (const line of md.split('\n')) {
    const li = /^\s*[-*]\s+(.*)/.exec(line);
    if (li) {
      list.push({ text: inline(li[1]!) });
      continue;
    }
    flush();
    const h = /^#+\s+(.*)/.exec(line);
    if (h) out.push({ text: inline(h[1]!), bold: true, fontSize: 12, margin: [0, 8, 0, 4] });
    else if (line.trim()) out.push({ text: inline(line), margin: [0, 0, 0, 6] });
  }
  flush();
  return out;
}
