-- B484: снимок «поздней» отмены (<24ч до начала) на момент отмены.
ALTER TABLE "bookings" ADD COLUMN "late_cancel" BOOLEAN NOT NULL DEFAULT false;

-- B484: новые события уведомлений политики надёжности.
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'GOODWILL_CREDITS';
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'RELIABILITY_WARNING';
