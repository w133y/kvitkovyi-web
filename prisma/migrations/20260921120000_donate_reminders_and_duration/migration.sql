-- Reminder tracking for DonatePrivilege
ALTER TABLE "DonatePrivilege" ADD COLUMN "reminderSentAt" TIMESTAMP(3);

-- Chosen duration (months) for DonateOrder, defaulting existing rows to 1
ALTER TABLE "DonateOrder" ADD COLUMN "months" INTEGER NOT NULL DEFAULT 1;
