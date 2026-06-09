-- B348 / Механика 1: new notification event for the 3-day auto-renewal reminder.
ALTER TYPE "NotificationEvent" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_RENEWAL';
