-- Product.priceCents becomes nullable: null for COSMETIC rows, which are
-- priced in квітки (CosmeticItem.priceFlowers) instead of UAH cents.
ALTER TABLE "Product" ALTER COLUMN "priceCents" DROP NOT NULL;

-- CosmeticType, CosmeticStatus, CosmeticGrantStatus
CREATE TYPE "CosmeticType" AS ENUM ('HAT', 'BACKPACK', 'BALLOON', 'FURNITURE');
CREATE TYPE "CosmeticStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "CosmeticGrantStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

CREATE TABLE "CosmeticItem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "CosmeticType" NOT NULL,
    "status" "CosmeticStatus" NOT NULL DEFAULT 'DRAFT',
    "nexoItemId" TEXT NOT NULL,
    "hmcCosmeticId" TEXT,
    "colorCustomizable" BOOLEAN NOT NULL DEFAULT false,
    "modelKey" TEXT NOT NULL,
    "textureKey" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "sourcePackName" TEXT,
    "priceFlowers" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CosmeticItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CosmeticItem_productId_key" ON "CosmeticItem"("productId");
CREATE UNIQUE INDEX "CosmeticItem_nexoItemId_key" ON "CosmeticItem"("nexoItemId");

ALTER TABLE "CosmeticItem" ADD CONSTRAINT "CosmeticItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CosmeticOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "totalFlowers" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CosmeticOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CosmeticOrder_idempotencyKey_key" ON "CosmeticOrder"("idempotencyKey");
CREATE INDEX "CosmeticOrder_userId_idx" ON "CosmeticOrder"("userId");

ALTER TABLE "CosmeticOrder" ADD CONSTRAINT "CosmeticOrder_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CosmeticGrant" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "cosmeticItemId" TEXT NOT NULL,
    "status" "CosmeticGrantStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CosmeticGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CosmeticGrant_status_idx" ON "CosmeticGrant"("status");

ALTER TABLE "CosmeticGrant" ADD CONSTRAINT "CosmeticGrant_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "CosmeticOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CosmeticGrant" ADD CONSTRAINT "CosmeticGrant_cosmeticItemId_fkey"
    FOREIGN KEY ("cosmeticItemId") REFERENCES "CosmeticItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
