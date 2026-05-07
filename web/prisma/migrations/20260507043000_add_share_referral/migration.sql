-- B102-B108: safe share links and referral attribution.

CREATE TABLE IF NOT EXISTS "share_links" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "owner_user_id" TEXT,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT,
  "source_label" TEXT,
  "topic" TEXT,
  "preview_text" TEXT NOT NULL,
  "hide_question" BOOLEAN NOT NULL DEFAULT true,
  "show_watermark" BOOLEAN NOT NULL DEFAULT true,
  "opened_count" INTEGER NOT NULL DEFAULT 0,
  "last_opened_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "share_links_token_key" ON "share_links"("token");
CREATE INDEX IF NOT EXISTS "share_links_owner_user_id_created_at_idx" ON "share_links"("owner_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "share_links_source_type_source_id_idx" ON "share_links"("source_type", "source_id");

ALTER TABLE "share_links"
  ADD CONSTRAINT "share_links_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "referral_attributions" (
  "id" TEXT NOT NULL,
  "share_link_id" TEXT,
  "referrer_user_id" TEXT,
  "referred_user_id" TEXT,
  "visitor_hash" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'share',
  "status" TEXT NOT NULL DEFAULT 'OPENED',
  "blocked_reason" TEXT,
  "meaningful_action_at" TIMESTAMP(3),
  "reward_granted_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "referral_attributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "referral_attributions_share_link_id_visitor_hash_key"
  ON "referral_attributions"("share_link_id", "visitor_hash");
CREATE INDEX IF NOT EXISTS "referral_attributions_referrer_user_id_status_idx"
  ON "referral_attributions"("referrer_user_id", "status");
CREATE INDEX IF NOT EXISTS "referral_attributions_referred_user_id_idx"
  ON "referral_attributions"("referred_user_id");
CREATE INDEX IF NOT EXISTS "referral_attributions_visitor_hash_idx"
  ON "referral_attributions"("visitor_hash");

ALTER TABLE "referral_attributions"
  ADD CONSTRAINT "referral_attributions_share_link_id_fkey"
  FOREIGN KEY ("share_link_id") REFERENCES "share_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "referral_attributions"
  ADD CONSTRAINT "referral_attributions_referrer_user_id_fkey"
  FOREIGN KEY ("referrer_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "referral_attributions"
  ADD CONSTRAINT "referral_attributions_referred_user_id_fkey"
  FOREIGN KEY ("referred_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
