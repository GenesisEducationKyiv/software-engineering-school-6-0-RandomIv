-- AlterTable
ALTER TABLE "subscriptions"
ADD COLUMN "confirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "confirmation_token" TEXT,
ADD COLUMN "unsubscribe_token" TEXT;

-- Backfill existing rows so new columns can be required and unique
UPDATE "subscriptions"
SET
  "confirmation_token" = "id" || '-confirm',
  "unsubscribe_token" = "id" || '-unsubscribe'
WHERE "confirmation_token" IS NULL
   OR "unsubscribe_token" IS NULL;

-- Enforce non-null after backfill
ALTER TABLE "subscriptions"
ALTER COLUMN "confirmation_token" SET NOT NULL,
ALTER COLUMN "unsubscribe_token" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_confirmation_token_key"
ON "subscriptions"("confirmation_token");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_unsubscribe_token_key"
ON "subscriptions"("unsubscribe_token");
