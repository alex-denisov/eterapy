-- B212: Practitioner Pro STT, summary, and compliance evidence chain.
ALTER TABLE "video_sessions"
  ADD COLUMN "client_followup_draft" TEXT,
  ADD COLUMN "practitioner_notes_text" TEXT,
  ADD COLUMN "transcript_metadata" JSONB,
  ADD COLUMN "summary_metadata" JSONB,
  ADD COLUMN "compliance_status" TEXT NOT NULL DEFAULT 'not_reviewed',
  ADD COLUMN "compliance_risk_score" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "compliance_evidence" JSONB,
  ADD COLUMN "compliance_reviewed_at" TIMESTAMP(3);

CREATE INDEX "video_sessions_compliance_status_compliance_risk_score_idx"
  ON "video_sessions"("compliance_status", "compliance_risk_score");
