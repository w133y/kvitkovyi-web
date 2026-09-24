ALTER TABLE "DonatePrivilege" ADD COLUMN "expiredNoticeSentAt" TIMESTAMP(3);

CREATE TABLE "WelcomeDm" (
    "discordUserId" TEXT NOT NULL,
    "delivered" BOOLEAN NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WelcomeDm_pkey" PRIMARY KEY ("discordUserId")
);
