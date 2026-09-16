-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "iconType" TEXT NOT NULL DEFAULT 'emoji',
    "icon" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "borderColor" TEXT,
    "background" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Achievement_nickname_idx" ON "Achievement"("nickname");
