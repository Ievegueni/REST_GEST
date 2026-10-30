import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { protect } from '../../core/auth';
import { aiConfigured } from '../../integrations/anthropic';
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
}
