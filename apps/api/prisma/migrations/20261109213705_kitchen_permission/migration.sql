-- Tenants existentes: permissão do ecrã de cozinha para Administrador/Gerente e novo perfil base Cozinha.
INSERT INTO "Permission" ("id", "code") VALUES (gen_random_uuid()::text, 'kitchen.manage')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "Role" ("id", "tenantId", "name", "isSystem", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'Cozinha', true, now() FROM "Tenant" t
ON CONFLICT ("tenantId", "name") DO NOTHING;

INSERT INTO "_PermissionToRole" ("A", "B")
SELECT p."id", r."id" FROM "Role" r, "Permission" p
WHERE p."code" = 'kitchen.manage' AND r."isSystem" AND r."name" IN ('Administrador', 'Gerente', 'Cozinha')
ON CONFLICT DO NOTHING;
