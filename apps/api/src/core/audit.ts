import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export type AuditEntry = {
  tenantId: string | null;
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  ip?: string;
};

export function audit(entry: AuditEntry, tx: Prisma.TransactionClient = prisma) {
  return tx.auditLog.create({ data: entry });
}
