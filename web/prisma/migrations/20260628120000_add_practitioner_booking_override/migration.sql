-- B459 (walkthrough item 15): superadmin manual booking-enable override.
-- Bypasses the COMMERCIAL gate (agent offer + tax status + payout requisites) for
-- vetted/demo practitioners so a «Проверен ETerapy» specialist is bookable. Never
-- bypasses the active-status check.
ALTER TABLE "practitioners"
  ADD COLUMN "booking_override_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "booking_override_at" TIMESTAMP(3);
