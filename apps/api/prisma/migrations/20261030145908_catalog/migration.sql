-- DropForeignKey
ALTER TABLE "PasswordReset" DROP CONSTRAINT "PasswordReset_userId_fkey";

-- DropForeignKey
ALTER TABLE "RefreshToken" DROP CONSTRAINT "RefreshToken_userId_fkey";

-- DropForeignKey
ALTER TABLE "StockLocation" DROP CONSTRAINT "StockLocation_unitId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_roleId_fkey";

-- DropForeignKey
ALTER TABLE "UserUnit" DROP CONSTRAINT "UserUnit_unitId_fkey";

-- DropForeignKey
ALTER TABLE "UserUnit" DROP CONSTRAINT "UserUnit_userId_fkey";

-- DropIndex
DROP INDEX "User_tenantId_idx";

-- AlterTable
ALTER TABLE "PasswordReset" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "RefreshToken" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "StockLocation" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "Unit" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- AlterTable
ALTER TABLE "UserUnit" ALTER COLUMN "tenantId" SET DEFAULT current_setting('app.tenant_id');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasureUnit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeasureUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "stockUnitId" TEXT NOT NULL,
    "purchaseUnitId" TEXT,
    "consumptionUnitId" TEXT,
    "tracksLots" BOOLEAN NOT NULL DEFAULT false,
    "reorderPoint" DECIMAL(14,3),
    "preferredSupplierId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductUnitConversion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "productId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "factor" DECIMAL(20,10) NOT NULL,

    CONSTRAINT "ProductUnitConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductLocationLimit" (
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "minQty" DECIMAL(14,3),
    "maxQty" DECIMAL(14,3),

    CONSTRAINT "ProductLocationLimit_pkey" PRIMARY KEY ("productId","locationId")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "name" TEXT NOT NULL,
    "nif" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "paymentTermDays" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProduct" (
    "tenantId" TEXT NOT NULL DEFAULT current_setting('app.tenant_id'),
    "supplierId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierCode" TEXT,
    "lastPrice" INTEGER,
    "lastPriceAt" TIMESTAMP(3),

    CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("supplierId","productId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_tenantId_parentId_name_key" ON "Category"("tenantId", "parentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_tenantId_id_key" ON "Category"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MeasureUnit_tenantId_symbol_key" ON "MeasureUnit"("tenantId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "MeasureUnit_tenantId_id_key" ON "MeasureUnit"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Product_tenantId_categoryId_idx" ON "Product"("tenantId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_code_key" ON "Product"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Product_tenantId_id_key" ON "Product"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProductUnitConversion_tenantId_productId_unitId_key" ON "ProductUnitConversion"("tenantId", "productId", "unitId");

-- CreateIndex
CREATE INDEX "ProductLocationLimit_tenantId_idx" ON "ProductLocationLimit"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_tenantId_name_key" ON "Supplier"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_tenantId_id_key" ON "Supplier"("tenantId", "id");

-- CreateIndex
CREATE INDEX "SupplierProduct_tenantId_productId_idx" ON "SupplierProduct"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_id_key" ON "Role"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocation_tenantId_id_key" ON "StockLocation"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_tenantId_id_key" ON "Unit"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_id_key" ON "User"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_tenantId_unitId_fkey" FOREIGN KEY ("tenantId", "unitId") REFERENCES "Unit"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_tenantId_parentId_fkey" FOREIGN KEY ("tenantId", "parentId") REFERENCES "Category"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasureUnit" ADD CONSTRAINT "MeasureUnit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_categoryId_fkey" FOREIGN KEY ("tenantId", "categoryId") REFERENCES "Category"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_stockUnitId_fkey" FOREIGN KEY ("tenantId", "stockUnitId") REFERENCES "MeasureUnit"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_purchaseUnitId_fkey" FOREIGN KEY ("tenantId", "purchaseUnitId") REFERENCES "MeasureUnit"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_consumptionUnitId_fkey" FOREIGN KEY ("tenantId", "consumptionUnitId") REFERENCES "MeasureUnit"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_preferredSupplierId_fkey" FOREIGN KEY ("tenantId", "preferredSupplierId") REFERENCES "Supplier"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitConversion" ADD CONSTRAINT "ProductUnitConversion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitConversion" ADD CONSTRAINT "ProductUnitConversion_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "Product"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnitConversion" ADD CONSTRAINT "ProductUnitConversion_tenantId_unitId_fkey" FOREIGN KEY ("tenantId", "unitId") REFERENCES "MeasureUnit"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductLocationLimit" ADD CONSTRAINT "ProductLocationLimit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductLocationLimit" ADD CONSTRAINT "ProductLocationLimit_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "Product"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductLocationLimit" ADD CONSTRAINT "ProductLocationLimit_tenantId_locationId_fkey" FOREIGN KEY ("tenantId", "locationId") REFERENCES "StockLocation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_tenantId_supplierId_fkey" FOREIGN KEY ("tenantId", "supplierId") REFERENCES "Supplier"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProduct" ADD CONSTRAINT "SupplierProduct_tenantId_productId_fkey" FOREIGN KEY ("tenantId", "productId") REFERENCES "Product"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_roleId_fkey" FOREIGN KEY ("tenantId", "roleId") REFERENCES "Role"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUnit" ADD CONSTRAINT "UserUnit_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserUnit" ADD CONSTRAINT "UserUnit_tenantId_unitId_fkey" FOREIGN KEY ("tenantId", "unitId") REFERENCES "Unit"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

