-- CreateEnum
CREATE TYPE "DonateOrderStatus" AS ENUM ('PENDING', 'PAID');

-- CreateTable
CREATE TABLE "DonateOrder" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "tier" "DonateTier" NOT NULL,
    "iconSymbol" TEXT,
    "iconColorHex" TEXT,
    "amountUah" INTEGER NOT NULL,
    "status" "DonateOrderStatus" NOT NULL DEFAULT 'PENDING',
    "donatelloPubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "DonateOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DonateOrder_code_key" ON "DonateOrder"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DonateOrder_donatelloPubId_key" ON "DonateOrder"("donatelloPubId");

-- CreateIndex
CREATE INDEX "DonateOrder_userId_idx" ON "DonateOrder"("userId");

-- CreateIndex
CREATE INDEX "DonateOrder_status_idx" ON "DonateOrder"("status");

-- AddForeignKey
ALTER TABLE "DonateOrder" ADD CONSTRAINT "DonateOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
