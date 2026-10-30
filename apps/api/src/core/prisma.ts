import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Client "cru": só para uso dentro de `core` (auth, super admin, tenant).
 * Os módulos de negócio usam sempre `tenantDb(tenantId)`.
 */
export const prisma = new PrismaClient();

/** Modelos com coluna tenantId — derivado do schema, nada fixo à mão. */
const TENANT_MODELS = new Set(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === 'tenantId'))
    .map((m) => m.name),
);

type Args = Record<string, unknown> & { where?: object; data?: unknown; create?: object };

function guardData(data: unknown) {
  if (data && typeof data === 'object' && 'tenantId' in data) {
    throw new Error('tenantId não pode ser definido manualmente');
  }
}

/**
 * Client com isolamento por tenant: injecta `tenantId` em todos os filtros e escritas.
 * ponytail: só filtra a operação de topo; writes aninhados (create dentro de create)
 * não recebem tenantId — usar operações de topo ou passar pelo serviço do módulo.
 */
export function tenantDb(tenantId: string) {
  return prisma.$extends({
    name: 'tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const a = (args ?? {}) as Args;

          switch (operation) {
            case 'create':
              guardData(a.data);
              a.data = { ...(a.data as object), tenantId };
              break;
            case 'createMany':
            case 'createManyAndReturn': {
              const rows = Array.isArray(a.data) ? a.data : [a.data];
              rows.forEach(guardData);
              a.data = rows.map((r) => ({ ...(r as object), tenantId }));
              break;
            }
            case 'upsert':
              guardData(a.create);
              guardData(a.update);
              a.where = { ...a.where, tenantId };
              a.create = { ...a.create, tenantId };
              break;
            case 'update':
            case 'updateMany':
            case 'updateManyAndReturn':
              guardData(a.data);
              a.where = { ...a.where, tenantId };
              break;
            default:
              // find*, count, aggregate, groupBy, delete, deleteMany
              a.where = { ...a.where, tenantId };
          }
          return query(a as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
