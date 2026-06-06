-- Y10 Z12: practitioner commission ladder 35/30/25.
-- `commissionPercent` stays as the effective live value for compatibility.
-- `commissionPercentApplied` snapshots the rate used for completed bookings so
-- historical balances do not drift when live practitioner commission changes.

ALTER TABLE "bookings"
  ADD COLUMN "commissionPercentApplied" INTEGER;

UPDATE "bookings" b
SET "commissionPercentApplied" = p."commissionPercent"
FROM "practitioners" p
WHERE b."practitionerId" = p."id"
  AND b."status" = 'COMPLETED'
  AND b."commissionPercentApplied" IS NULL;

ALTER TABLE "practitioners"
  ADD COLUMN "baseCommissionPercent" INTEGER NOT NULL DEFAULT 35,
  ADD COLUMN "commissionOverride" INTEGER,
  ADD COLUMN "commissionSource" TEXT NOT NULL DEFAULT 'base',
  ADD COLUMN "commissionSyncedAt" TIMESTAMP(3);

-- The old default 25 represented Free practitioners before the new ladder.
-- Lift them to the new Free base of 35.
UPDATE "practitioners"
SET
  "commissionPercent" = 35,
  "baseCommissionPercent" = 35,
  "commissionOverride" = NULL,
  "commissionSource" = 'base',
  "commissionSyncedAt" = NOW()
WHERE "commissionPercent" = 25;

-- Any non-default historical value is treated as an individual negotiated rate
-- until the admin explicitly changes it.
UPDATE "practitioners"
SET
  "baseCommissionPercent" = "commissionPercent",
  "commissionOverride" = "commissionPercent",
  "commissionSource" = 'override',
  "commissionSyncedAt" = NOW()
WHERE "commissionPercent" <> 35;

-- Apply active Practitioner Pro subscriptions immediately, without waiting for
-- the nightly sync. Overrides and lower individual bases remain protected.
UPDATE "practitioners" p
SET
  "commissionPercent" = 30,
  "commissionSource" = 'subscription_pro',
  "commissionSyncedAt" = NOW()
WHERE p."commissionOverride" IS NULL
  AND p."baseCommissionPercent" >= 30
  AND EXISTS (
    SELECT 1 FROM "user_subscriptions" s
    WHERE s."userId" = p."userId"
      AND s."planKey" = 'practitioner_pro'
      AND s."status" IN ('TRIALING', 'ACTIVE')
      AND (s."currentPeriodEnd" IS NULL OR s."currentPeriodEnd" > NOW())
  );

UPDATE "practitioners" p
SET
  "commissionPercent" = 25,
  "commissionSource" = 'subscription_pro_plus',
  "commissionSyncedAt" = NOW()
WHERE p."commissionOverride" IS NULL
  AND p."baseCommissionPercent" >= 25
  AND EXISTS (
    SELECT 1 FROM "user_subscriptions" s
    WHERE s."userId" = p."userId"
      AND s."planKey" = 'practitioner_pro_plus'
      AND s."status" IN ('TRIALING', 'ACTIVE')
      AND (s."currentPeriodEnd" IS NULL OR s."currentPeriodEnd" > NOW())
  );
