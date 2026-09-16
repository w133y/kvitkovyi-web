-- CreateTable
CREATE TABLE "AdminLogEntry" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminLogEntry_createdAt_idx" ON "AdminLogEntry"("createdAt");
