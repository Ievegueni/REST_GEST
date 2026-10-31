/** Definições globais da plataforma (Super Admin → Integrações), com cache curta. */
import { decrypt, encrypt } from './crypto';
import { prisma } from './prisma';

const TTL = 30_000;
let cache: { at: number; values: Map<string, string> } | null = null;

async function all() {
  if (cache && Date.now() - cache.at < TTL) return cache.values;
  const rows = await prisma.platformSetting.findMany();
  const values = new Map(rows.map((r) => [r.key, r.secret ? decrypt(r.value) : r.value]));
  cache = { at: Date.now(), values };
  return values;
}

export const getSetting = async (key: string) => (await all()).get(key);

/** string = definir; null = apagar; undefined = manter. */
export async function setSettings(
  values: Record<string, string | null | undefined>,
  opts: { secret?: string[]; by?: string } = {},
) {
  for (const [key, v] of Object.entries(values)) {
    if (v === undefined) continue;
    if (v === null || v === '') {
      await prisma.platformSetting.deleteMany({ where: { key } });
      continue;
    }
    const secret = opts.secret?.includes(key) ?? false;
    const value = secret ? encrypt(v) : v;
    await prisma.platformSetting.upsert({
      where: { key },
      update: { value, secret, updatedBy: opts.by },
      create: { key, value, secret, updatedBy: opts.by },
    });
  }
  cache = null;
}
