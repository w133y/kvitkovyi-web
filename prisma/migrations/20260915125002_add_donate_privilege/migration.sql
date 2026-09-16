-- CreateEnum
CREATE TYPE "DonateTier" AS ENUM ('FLORIST', 'MECENAT');

-- CreateTable
CREATE TABLE "DonatePrivilege" (
    "id" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "tier" "DonateTier" NOT NULL,
    "iconSymbol" TEXT,
    "iconColorHex" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DonatePrivilege_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DonatePrivilege_nickname_idx" ON "DonatePrivilege"("nickname");
