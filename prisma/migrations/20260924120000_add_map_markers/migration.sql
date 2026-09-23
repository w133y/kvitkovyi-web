CREATE TYPE "MapMarkerType" AS ENUM ('CITY', 'FARM', 'EVENT', 'MONUMENT');
CREATE TYPE "MapMarkerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "MapMarker" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "MapMarkerType" NOT NULL,
    "description" TEXT,
    "discordInvite" TEXT,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "z" INTEGER NOT NULL,
    "status" "MapMarkerStatus" NOT NULL DEFAULT 'PENDING',
    "submittedByUserId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "discordMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "MapMarker_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MapMarker_status_idx" ON "MapMarker"("status");
CREATE INDEX "MapMarker_submittedByUserId_createdAt_idx" ON "MapMarker"("submittedByUserId", "createdAt");

ALTER TABLE "MapMarker" ADD CONSTRAINT "MapMarker_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
