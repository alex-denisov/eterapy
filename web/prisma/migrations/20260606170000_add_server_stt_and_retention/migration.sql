-- Z19: Server-side STT (Pro+) consent, worker state, and retention windows.
ALTER TABLE "video_sessions"
  ADD COLUMN "recording_egress_id" TEXT,
  ADD COLUMN "recording_consent_client_at" TIMESTAMP(3),
  ADD COLUMN "recording_consent_practitioner_at" TIMESTAMP(3),
  ADD COLUMN "server_stt_status" TEXT NOT NULL DEFAULT 'not_requested',
  ADD COLUMN "server_stt_job_id" TEXT,
  ADD COLUMN "server_stt_egress_id" TEXT,
  ADD COLUMN "server_stt_audio_url" TEXT,
  ADD COLUMN "server_stt_audio_expires_at" TIMESTAMP(3),
  ADD COLUMN "transcript_expires_at" TIMESTAMP(3),
  ADD COLUMN "summary_expires_at" TIMESTAMP(3),
  ADD COLUMN "compliance_evidence_expires_at" TIMESTAMP(3);

CREATE INDEX "video_sessions_recording_egress_id_idx" ON "video_sessions"("recording_egress_id");
CREATE INDEX "video_sessions_server_stt_status_idx" ON "video_sessions"("server_stt_status");
CREATE INDEX "video_sessions_transcript_expires_at_idx" ON "video_sessions"("transcript_expires_at");
CREATE INDEX "video_sessions_summary_expires_at_idx" ON "video_sessions"("summary_expires_at");
CREATE INDEX "video_sessions_compliance_evidence_expires_at_idx" ON "video_sessions"("compliance_evidence_expires_at");
CREATE INDEX "video_sessions_server_stt_audio_expires_at_idx" ON "video_sessions"("server_stt_audio_expires_at");
