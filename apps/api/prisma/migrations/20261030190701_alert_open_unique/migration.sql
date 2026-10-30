-- Um só alerta aberto por chave (deduplicação concorrente). Índice parcial: não expressável no schema Prisma.
CREATE UNIQUE INDEX "Alert_open_key" ON "Alert" ("tenantId", "key") WHERE "status" = 'OPEN';
