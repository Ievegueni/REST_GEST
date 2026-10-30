import type { Tx } from '../modules/stock/engine';

/** Próximo número de documento (PO, GR, TR, INV) do tenant. Usar dentro da transacção do documento. */
export async function nextNumber(tx: Tx, tenantId: string, key: string): Promise<number> {
  const [row] = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "DocumentSequence" ("tenantId", "key", "value") VALUES (${tenantId}, ${key}, 1)
    ON CONFLICT ("tenantId", "key") DO UPDATE SET "value" = "DocumentSequence"."value" + 1
    RETURNING "value"`;
  return row!.value;
}
