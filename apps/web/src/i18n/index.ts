import { ptAO } from './pt-AO';

export type TKey = keyof typeof ptAO;

/** Texto traduzido; `{nome}` é substituído por vars.nome. */
export const t = (key: TKey, vars?: Record<string, string | number>): string =>
  vars ? ptAO[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : ptAO[key];
