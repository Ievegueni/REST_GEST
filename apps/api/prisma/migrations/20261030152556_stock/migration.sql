-- CreateEnum
CREATE TYPE "NegativeStockPolicy" AS ENUM ('ALLOW', 'BLOCK');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('PURCHASE_IN', 'SALE_OUT', 'CONSUMPTION', 'WASTE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'INVENTORY_ADJUST', 'RETURN_SUPPLIER');

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

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
ALTER TABLE "RefreshToken" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "StockLocation" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Supplier" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "SupplierProduct" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "negativeStockPolicy" "NegativeStockPolicy" NOT NULL DEFAULT 'ALLOW';

-- AlterTable
ALTER TABLE "Unit" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "UserUnit" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiryDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "lotId" TEXT,
    "type" "MovementType" NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "totalCost" INTEGER NOT NULL,
    "balanceAfter" DECIMAL(14,3) NOT NULL,
    "reason" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "reversalOfId" TEXT,
    "userId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("productId","locationId")
);

-- CreateTable
CREATE TABLE "StockLotBalance" (
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLotBalance_pkey" PRIMARY KEY ("lotId","locationId")
);

-- CreateTable
CREATE TABLE "StockCost" (
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "productId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "avgCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockCost_pkey" PRIMARY KEY ("productId","unitId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lot_tenantId_productId_code_key" ON "Lot"("tenantId", "productId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_tenantId_id_key" ON "Lot"("tenantId", "id");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_productId_locationId_occurredAt_idx" ON "StockMovement"("tenantId", "productId", "locationId", "occurredAt");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_productId_locationId_createdAt_idx" ON "StockMovement"("tenantId", "productId", "locationId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_refType_refId_idx" ON "StockMovement"("tenantId", "refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_tenantId_id_key" ON "StockMovement"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_tenantId_reversalOfId_key" ON "StockMovement"("tenantId", "reversalOfId");

-- CreateIndex
CREATE INDEX "StockBalance_tenantId_locationId_idx" ON "StockBalance"("tenantId", "locationId");

-- CreateIndex
CREATE INDEX "StockLotBalance_tenantId_productId_locationId_idx" ON "StockLotBalance"("tenantId", "productId", "locationId");

-- CreateIndex
CREATE INDEX "StockCost_tenantId_idx" ON "StockCost"("tenantId");

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "Product"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "Product"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_locationId_fkey" FOREIGN KEY ("tenantId", "locationId") REFERENCES "StockLocation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_lotId_fkey" FOREIGN KEY ("tenantId", "lotId") REFERENCES "Lot"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_tenantId_reversalOfId_fkey" FOREIGN KEY ("tenantId", "reversalOfId") REFERENCES "StockMovement"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "Product"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_tenantId_locationId_fkey" FOREIGN KEY ("tenantId", "locationId") REFERENCES "StockLocation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLotBalance" ADD CONSTRAINT "StockLotBalance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLotBalance" ADD CONSTRAINT "StockLotBalance_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "Product"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLotBalance" ADD CONSTRAINT "StockLotBalance_tenantId_locationId_fkey" FOREIGN KEY ("tenantId", "locationId") REFERENCES "StockLocation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLotBalance" ADD CONSTRAINT "StockLotBalance_tenantId_lotId_fkey" FOREIGN KEY ("tenantId", "lotId") REFERENCES "Lot"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCost" ADD CONSTRAINT "StockCost_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCost" ADD CONSTRAINT "StockCost_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "Product"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCost" ADD CONSTRAINT "StockCost_tenantId_unitId_fkey" FOREIGN KEY ("tenantId", "unitId") REFERENCES "Unit"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

