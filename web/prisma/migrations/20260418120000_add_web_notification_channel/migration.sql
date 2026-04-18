-- Add WEB value to NotificationChannel enum (in-cabinet bell dropdown).
-- Additive change; existing rows remain EMAIL or TELEGRAM.

ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'WEB';
