-- Y10 Z16: onboarding missions and durable practice streak counters.
ALTER TABLE "users"
  ADD COLUMN "practice_streak_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "practice_streak_longest" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "practice_last_done_date" TIMESTAMP(3);

CREATE TABLE "mission_progress" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "missionKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "target" INTEGER NOT NULL DEFAULT 1,
  "completedAt" TIMESTAMP(3),
  "rewardGrantedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "mission_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mission_progress_userId_missionKey_key" ON "mission_progress"("userId", "missionKey");
CREATE INDEX "mission_progress_userId_status_idx" ON "mission_progress"("userId", "status");
CREATE INDEX "mission_progress_completedAt_idx" ON "mission_progress"("completedAt");

ALTER TABLE "mission_progress"
  ADD CONSTRAINT "mission_progress_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
