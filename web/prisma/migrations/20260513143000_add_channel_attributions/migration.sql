CREATE TABLE "channel_attributions" (
  "id" TEXT NOT NULL,
  "visitor_hash" TEXT NOT NULL,
  "user_id" TEXT,
  "source" TEXT NOT NULL DEFAULT 'direct',
  "channel" TEXT NOT NULL DEFAULT 'web',
  "utm_source" TEXT,
  "utm_medium" TEXT,
  "utm_campaign" TEXT,
  "utm_content" TEXT,
  "utm_term" TEXT,
  "referral_token" TEXT,
  "practitioner_id" TEXT,
  "practitioner_slug" TEXT,
  "partner_id" TEXT,
  "widget_id" TEXT,
  "entry_product" TEXT,
  "first_entry_path" TEXT NOT NULL,
  "last_entry_path" TEXT NOT NULL,
  "first_touch_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_touch_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "conversion_at" TIMESTAMP(3),
  "conversion_type" TEXT,
  "conversion_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "channel_attributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_attributions_visitor_hash_key" ON "channel_attributions"("visitor_hash");
CREATE INDEX "channel_attributions_user_id_last_touch_at_idx" ON "channel_attributions"("user_id", "last_touch_at");
CREATE INDEX "channel_attributions_source_channel_last_touch_at_idx" ON "channel_attributions"("source", "channel", "last_touch_at");
CREATE INDEX "channel_attributions_entry_product_last_touch_at_idx" ON "channel_attributions"("entry_product", "last_touch_at");
CREATE INDEX "channel_attributions_practitioner_id_last_touch_at_idx" ON "channel_attributions"("practitioner_id", "last_touch_at");
CREATE INDEX "channel_attributions_partner_id_last_touch_at_idx" ON "channel_attributions"("partner_id", "last_touch_at");
CREATE INDEX "channel_attributions_widget_id_last_touch_at_idx" ON "channel_attributions"("widget_id", "last_touch_at");

ALTER TABLE "channel_attributions"
  ADD CONSTRAINT "channel_attributions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
