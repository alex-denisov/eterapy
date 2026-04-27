-- Durable background job queue for v5 reliability foundation.

CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD');

CREATE TABLE "jobs" (
  "id" TEXT NOT NULL,
  "queue" TEXT NOT NULL DEFAULT 'default',
  "type" TEXT NOT NULL,
  "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB NOT NULL,
  "result" JSONB,
  "error" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 3,
  "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(3),
  "locked_by" TEXT,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "idempotency_key" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "jobs_queue_type_idempotency_key_key" ON "jobs"("queue", "type", "idempotency_key");
CREATE INDEX "jobs_status_run_after_priority_created_at_idx" ON "jobs"("status", "run_after", "priority", "created_at");
CREATE INDEX "jobs_queue_status_run_after_idx" ON "jobs"("queue", "status", "run_after");
CREATE INDEX "jobs_locked_at_idx" ON "jobs"("locked_at");
