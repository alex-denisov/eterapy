-- Web-channel notification feed (surfaced in cabinet bell dropdown).

CREATE TABLE IF NOT EXISTS "notifications" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "event"     "NotificationEvent" NOT NULL,
    "title"     TEXT NOT NULL,
    "body"      TEXT NOT NULL,
    "href"      TEXT,
    "readAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notifications_userId_createdAt_idx"
    ON "notifications"("userId", "createdAt");

ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
