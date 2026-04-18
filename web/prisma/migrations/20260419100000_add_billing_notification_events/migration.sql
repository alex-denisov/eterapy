-- Add new NotificationEvent enum values for billing events
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'BALANCE_TOPUP';
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'CARD_LINKED';
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'CARD_REMOVED';
