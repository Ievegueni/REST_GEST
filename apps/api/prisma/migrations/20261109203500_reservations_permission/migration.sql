-- Tenants existentes: permissão de reservas para Administrador/Gerente e novo perfil base Recepção.
INSERT INTO "Permission" ("id", "code") VALUES (gen_random_uuid()::text, 'reservations.manage')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "Role" ("id", "tenantId", "name", "isSystem", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'Recepção', true, now() FROM "Tenant" t
ON CONFLICT ("tenantId", "name") DO NOTHING;

INSERT INTO "_PermissionToRole" ("A", "B")
SELECT p."id", r."id" FROM "Role" r, "Permission" p
WHERE p."code" = 'reservations.manage' AND r."isSystem" AND r."name" IN ('Administrador', 'Gerente', 'Recepção')
ON CONFLICT DO NOTHING;
