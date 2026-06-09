-- B363 / Механика 12: explicit consent to publish a question in the public
-- library. library_status NULL = private (strict default; never published
-- without consent). See web/src/lib/library-consent.ts for the state machine.
ALTER TABLE "dialogues"
  ADD COLUMN "library_consent_at" TIMESTAMP(3),
  ADD COLUMN "library_status" TEXT;

CREATE INDEX "dialogues_library_status_library_consent_at_idx"
  ON "dialogues"("library_status", "library_consent_at");
