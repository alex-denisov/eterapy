-- B616: conversational register chosen for an engagement reply.
ALTER TABLE "external_publications" ADD COLUMN IF NOT EXISTS "engagement_tone" TEXT;
