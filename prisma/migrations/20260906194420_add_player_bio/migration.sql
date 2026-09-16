-- CreateTable
CREATE TABLE "PlayerBio" (
    "nickname" TEXT NOT NULL,
    "bio" VARCHAR(160) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerBio_pkey" PRIMARY KEY ("nickname")
);
