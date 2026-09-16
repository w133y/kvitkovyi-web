-- AlterEnum
ALTER TYPE "DonateOrderStatus" ADD VALUE 'EXPIRED';

-- AlterTable: add nullable, backfill from the existing `nickname` column
-- (every pre-existing order was bought for the buyer's own account, since
-- gifting to another recipient didn't exist yet), then require it.
ALTER TABLE "DonateOrder" ADD COLUMN     "buyerNickname" TEXT;
UPDATE "DonateOrder" SET "buyerNickname" = "nickname" WHERE "buyerNickname" IS NULL;
ALTER TABLE "DonateOrder" ALTER COLUMN "buyerNickname" SET NOT NULL;
