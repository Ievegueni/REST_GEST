-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AlertType" ADD VALUE 'PAYABLE_DUE';
ALTER TYPE "AlertType" ADD VALUE 'PAYABLE_OVERDUE';

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
ALTER TABLE "PaymentMethod" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "PayrollLine" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "PayrollRun" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "PosItemMapping" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

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
CREATE TABLE "Payable" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "supplierId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "receiptId" TEXT,
    "documentNumber" TEXT,
    "description" TEXT,
    "issueDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "PayableStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayablePayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "payableId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "paymentMethodId" TEXT,
    "reference" TEXT,
    "attachmentUrl" TEXT,
    "attachmentName" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayablePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payable_tenantId_status_dueDate_idx" ON "Payable"("tenantId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Payable_tenantId_supplierId_idx" ON "Payable"("tenantId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Payable_tenantId_id_key" ON "Payable"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Payable_tenantId_receiptId_key" ON "Payable"("tenantId", "receiptId");

-- CreateIndex
CREATE INDEX "PayablePayment_tenantId_payableId_idx" ON "PayablePayment"("tenantId", "payableId");

-- CreateIndex
CREATE INDEX "PayablePayment_tenantId_date_idx" ON "PayablePayment"("tenantId", "date");

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_tenantId_supplierId_fkey" FOREIGN KEY ("tenantId", "supplierId") REFERENCES "Supplier"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_tenantId_unitId_fkey" FOREIGN KEY ("tenantId", "unitId") REFERENCES "Unit"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "Payable_tenantId_receiptId_fkey" FOREIGN KEY ("tenantId", "receiptId") REFERENCES "GoodsReceipt"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_tenantId_payableId_fkey" FOREIGN KEY ("tenantId", "payableId") REFERENCES "Payable"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_tenantId_paymentMethodId_fkey" FOREIGN KEY ("tenantId", "paymentMethodId") REFERENCES "PaymentMethod"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

