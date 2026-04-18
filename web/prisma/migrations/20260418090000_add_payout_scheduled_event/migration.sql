-- Add PAYOUT_SCHEDULED to NotificationEvent enum (for superadmin payout notifications).
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'PAYOUT_SCHEDULED';
