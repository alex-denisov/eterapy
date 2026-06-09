-- B348 / Механика 1: 3-day auto-renewal reminder. renewal_reminder_at dedupes
-- the reminder per billing period (compared against current_period_start).
ALTER TABLE "user_subscriptions"
  ADD COLUMN "renewalReminderAt" TIMESTAMP(3);

CREATE INDEX "user_subscriptions_status_currentPeriodEnd_idx"
  ON "user_subscriptions"("status", "currentPeriodEnd");
