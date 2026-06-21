-- Issue #7: chat-analysis «продолжить разговор в чате» keys its own seeded chat
-- session to the analysis instead of reusing the user's latest standalone chat.

-- AlterTable
ALTER TABLE "companion_chat_sessions" ADD COLUMN "source_analysis_id" TEXT;

-- CreateIndex
CREATE INDEX "companion_chat_source_analysis_idx" ON "companion_chat_sessions"("user_id", "source_analysis_id");
