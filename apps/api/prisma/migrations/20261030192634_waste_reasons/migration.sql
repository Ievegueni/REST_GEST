-- AlterTable
ALTER TABLE "Alert" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "AlertRule" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "CategoryOutputLocation" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "DocumentSequence" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

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
ALTER TABLE "Lot" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "MeasureUnit" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Notification" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "PasswordReset" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "PosItemMapping" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

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

-- CreateTable
CREATE TABLE "WasteReason" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WasteReason_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WasteReason_tenantId_name_key" ON "WasteReason"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "WasteReason" ADD CONSTRAINT "WasteReason_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

