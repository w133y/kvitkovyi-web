-- CreateTable
CREATE TABLE "AdminSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "errorLoggingEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AdminSettings_pkey" PRIMARY KEY ("id")
);
