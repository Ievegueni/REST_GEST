import { ptAO } from './pt-AO';

export type TKey = keyof typeof ptAO;
export const t = (key: TKey): string => ptAO[key];
