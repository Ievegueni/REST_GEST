-- CreateEnum
CREATE TYPE "KitchenStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'READY');

-- AlterTable
ALTER TABLE "AiReport" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "AiRequest" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Alert" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "AlertRule" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Attendance" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "CashMovement" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "CashSession" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "CashSessionAmount" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "CategoryOutputLocation" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "CostCategory" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "DailyCost" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Department" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "DiningTable" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "DocumentSequence" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Employee" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "EmployeeAllowance" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "EmployeeDeduction" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "EmployeeDocument" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "GoodsReceipt" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "GoodsReceiptLine" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "ImportProfile" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "InventoryCount" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "InventoryCountLine" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Leave" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Lot" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "MeasureUnit" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "PasswordReset" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Payable" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "PayablePayment" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "PaymentMethod" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "PayrollLine" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "PayrollRun" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "PosDocument" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "PosItemMapping" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "PosPayment" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Position" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "ProductLocationLimit" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "ProductUnitConversion" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "PurchaseOrder" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "RecipeLine" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "RecurringCost" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "RefreshToken" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Reservation" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "SaleItem" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "SalesImport" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "SalesImportLine" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Shift" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "SmsLog" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "StockBalance" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "StockCost" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "StockLocation" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "StockLotBalance" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "StockMovement" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Supplier" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "SupplierProduct" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "kdsLateMinutes" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "kdsWarnMinutes" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Transfer" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "TransferLine" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Unit" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "UserUnit" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "WasteReason" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- CreateTable
CREATE TABLE "KitchenTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "unitId" TEXT NOT NULL,
    "posDocId" TEXT NOT NULL,
    "round" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "table" TEXT,
    "status" "KitchenStatus" NOT NULL DEFAULT 'NEW',
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "KitchenTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitchenItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "ticketId" TEXT NOT NULL,
    "posLineId" TEXT NOT NULL,
    "posCode" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "KitchenItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KitchenTicket_tenantId_unitId_zone_closedAt_idx" ON "KitchenTicket"("tenantId", "unitId", "zone", "closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenTicket_tenantId_unitId_posDocId_round_zone_key" ON "KitchenTicket"("tenantId", "unitId", "posDocId", "round", "zone");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenTicket_tenantId_id_key" ON "KitchenTicket"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "KitchenItem_tenantId_ticketId_posLineId_key" ON "KitchenItem"("tenantId", "ticketId", "posLineId");

-- AddForeignKey
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenTicket" ADD CONSTRAINT "KitchenTicket_tenantId_unitId_fkey" FOREIGN KEY ("tenantId", "unitId") REFERENCES "Unit"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenItem" ADD CONSTRAINT "KitchenItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitchenItem" ADD CONSTRAINT "KitchenItem_tenantId_ticketId_fkey" FOREIGN KEY ("tenantId", "ticketId") REFERENCES "KitchenTicket"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

