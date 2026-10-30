-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('SALES_BY_ITEM', 'PAYMENTS');

-- CreateEnum
CREATE TYPE "SalesImportStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED', 'CONFIRMED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "DocumentSequence" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "GoodsReceipt" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "GoodsReceiptLine" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "InventoryCount" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "InventoryCountLine" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Lot" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "MeasureUnit" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "PasswordReset" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

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
ALTER TABLE "RefreshToken" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

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
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "salePrice" INTEGER,
    "isSubRecipe" BOOLEAN NOT NULL DEFAULT false,
    "yieldQty" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "yieldUnit" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "saleItemId" TEXT NOT NULL,
    "productId" TEXT,
    "subRecipeId" TEXT,
    "unitId" TEXT,
    "qty" DECIMAL(14,3) NOT NULL,
    "lossPct" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "RecipeLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryOutputLocation" (
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "categoryId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,

    CONSTRAINT "CategoryOutputLocation_pkey" PRIMARY KEY ("categoryId","unitId")
);

-- CreateTable
CREATE TABLE "ImportProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "name" TEXT NOT NULL,
    "posName" TEXT NOT NULL,
    "kind" "ImportKind" NOT NULL DEFAULT 'SALES_BY_ITEM',
    "sheetName" TEXT,
    "headerRow" INTEGER NOT NULL DEFAULT 1,
    "columns" JSONB NOT NULL,
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "decimalSeparator" TEXT NOT NULL DEFAULT ',',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosItemMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "posName" TEXT NOT NULL,
    "posCode" TEXT NOT NULL,
    "posLabel" TEXT,
    "saleItemId" TEXT,
    "ignore" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosItemMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesImport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "number" INTEGER NOT NULL,
    "unitId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileHash" TEXT NOT NULL,
    "status" "SalesImportStatus" NOT NULL DEFAULT 'PROCESSING',
    "periodFrom" DATE,
    "periodTo" DATE,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,

    CONSTRAINT "SalesImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesImportLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "importId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "posCode" TEXT NOT NULL,
    "posLabel" TEXT,
    "qty" DECIMAL(14,3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "saleDate" DATE NOT NULL,
    "saleItemId" TEXT,
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "SalesImportLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaleItem_tenantId_code_key" ON "SaleItem"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "SaleItem_tenantId_id_key" ON "SaleItem"("tenantId", "id");

-- CreateIndex
CREATE INDEX "RecipeLine_tenantId_saleItemId_idx" ON "RecipeLine"("tenantId", "saleItemId");

-- CreateIndex
CREATE INDEX "CategoryOutputLocation_tenantId_idx" ON "CategoryOutputLocation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportProfile_tenantId_name_key" ON "ImportProfile"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ImportProfile_tenantId_id_key" ON "ImportProfile"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "PosItemMapping_tenantId_posName_posCode_key" ON "PosItemMapping"("tenantId", "posName", "posCode");

-- CreateIndex
CREATE INDEX "SalesImport_tenantId_unitId_periodFrom_periodTo_idx" ON "SalesImport"("tenantId", "unitId", "periodFrom", "periodTo");

-- CreateIndex
CREATE INDEX "SalesImport_tenantId_fileHash_idx" ON "SalesImport"("tenantId", "fileHash");

-- CreateIndex
CREATE UNIQUE INDEX "SalesImport_tenantId_number_key" ON "SalesImport"("tenantId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "SalesImport_tenantId_id_key" ON "SalesImport"("tenantId", "id");

-- CreateIndex
CREATE INDEX "SalesImportLine_tenantId_importId_posCode_idx" ON "SalesImportLine"("tenantId", "importId", "posCode");

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_tenantId_saleItemId_fkey" FOREIGN KEY ("tenantId", "saleItemId") REFERENCES "SaleItem"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "Product"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_tenantId_subRecipeId_fkey" FOREIGN KEY ("tenantId", "subRecipeId") REFERENCES "SaleItem"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeLine" ADD CONSTRAINT "RecipeLine_tenantId_unitId_fkey" FOREIGN KEY ("tenantId", "unitId") REFERENCES "MeasureUnit"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryOutputLocation" ADD CONSTRAINT "CategoryOutputLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryOutputLocation" ADD CONSTRAINT "CategoryOutputLocation_tenantId_categoryId_fkey" FOREIGN KEY ("tenantId", "categoryId") REFERENCES "Category"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryOutputLocation" ADD CONSTRAINT "CategoryOutputLocation_tenantId_unitId_fkey" FOREIGN KEY ("tenantId", "unitId") REFERENCES "Unit"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryOutputLocation" ADD CONSTRAINT "CategoryOutputLocation_tenantId_locationId_fkey" FOREIGN KEY ("tenantId", "locationId") REFERENCES "StockLocation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportProfile" ADD CONSTRAINT "ImportProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosItemMapping" ADD CONSTRAINT "PosItemMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosItemMapping" ADD CONSTRAINT "PosItemMapping_tenantId_saleItemId_fkey" FOREIGN KEY ("tenantId", "saleItemId") REFERENCES "SaleItem"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesImport" ADD CONSTRAINT "SalesImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesImport" ADD CONSTRAINT "SalesImport_tenantId_unitId_fkey" FOREIGN KEY ("tenantId", "unitId") REFERENCES "Unit"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesImport" ADD CONSTRAINT "SalesImport_tenantId_profileId_fkey" FOREIGN KEY ("tenantId", "profileId") REFERENCES "ImportProfile"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesImportLine" ADD CONSTRAINT "SalesImportLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesImportLine" ADD CONSTRAINT "SalesImportLine_tenantId_importId_fkey" FOREIGN KEY ("tenantId", "importId") REFERENCES "SalesImport"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesImportLine" ADD CONSTRAINT "SalesImportLine_tenantId_saleItemId_fkey" FOREIGN KEY ("tenantId", "saleItemId") REFERENCES "SaleItem"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

