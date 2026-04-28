-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "resourceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "payload" JSONB,
    "result" JSONB,
    "error" TEXT,
    "requestId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_eventId_key" ON "webhook_events"("provider", "eventId");

-- CreateIndex
CREATE INDEX "webhook_events_provider_receivedAt_idx" ON "webhook_events"("provider", "receivedAt");

-- CreateIndex
CREATE INDEX "webhook_events_provider_resourceId_idx" ON "webhook_events"("provider", "resourceId");
