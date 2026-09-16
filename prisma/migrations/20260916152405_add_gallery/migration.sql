-- CreateEnum
CREATE TYPE "GalleryPhotoStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GalleryPhotoSource" AS ENUM ('SITE', 'DISCORD', 'LEGACY');

-- CreateTable
CREATE TABLE "GalleryPhoto" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "cloudinaryPublicId" TEXT,
    "description" TEXT,
    "showDescription" BOOLEAN NOT NULL DEFAULT true,
    "author" TEXT,
    "season" INTEGER NOT NULL,
    "source" "GalleryPhotoSource" NOT NULL,
    "status" "GalleryPhotoStatus" NOT NULL DEFAULT 'PENDING',
    "submittedByUserId" TEXT,
    "submittedByDiscordId" TEXT,
    "discordMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "GalleryPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GallerySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "currentSeason" INTEGER NOT NULL DEFAULT 1,
    "pendingSeason" INTEGER,
    "pendingSeasonMessageId" TEXT,
    "pendingSeasonAdminName" TEXT,

    CONSTRAINT "GallerySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GalleryPhoto_status_idx" ON "GalleryPhoto"("status");

-- CreateIndex
CREATE INDEX "GalleryPhoto_source_status_createdAt_idx" ON "GalleryPhoto"("source", "status", "createdAt");

-- CreateIndex
CREATE INDEX "GalleryPhoto_season_idx" ON "GalleryPhoto"("season");

-- AddForeignKey
ALTER TABLE "GalleryPhoto" ADD CONSTRAINT "GalleryPhoto_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
