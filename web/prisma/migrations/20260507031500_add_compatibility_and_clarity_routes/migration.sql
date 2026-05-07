-- B089-B092: durable Compatibility and Seven Days route tables.

CREATE TABLE IF NOT EXISTS "compatibilities" (
  "id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "partner_id" TEXT,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "invite_token" TEXT NOT NULL,
  "creator_consent" BOOLEAN NOT NULL DEFAULT false,
  "partner_consent" BOOLEAN NOT NULL DEFAULT false,
  "report_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "compatibilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "compatibilities_invite_token_key" ON "compatibilities"("invite_token");
CREATE UNIQUE INDEX IF NOT EXISTS "compatibilities_report_id_key" ON "compatibilities"("report_id");
CREATE INDEX IF NOT EXISTS "compatibilities_creator_id_idx" ON "compatibilities"("creator_id");
CREATE INDEX IF NOT EXISTS "compatibilities_partner_id_idx" ON "compatibilities"("partner_id");
CREATE INDEX IF NOT EXISTS "compatibilities_invite_token_idx" ON "compatibilities"("invite_token");

ALTER TABLE "compatibilities"
  ADD CONSTRAINT "compatibilities_creator_id_fkey"
  FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "compatibilities"
  ADD CONSTRAINT "compatibilities_partner_id_fkey"
  FOREIGN KEY ("partner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "compatibilities"
  ADD CONSTRAINT "compatibilities_report_id_fkey"
  FOREIGN KEY ("report_id") REFERENCES "product_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "clarity_routes" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "dialogue_id" TEXT,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "current_day" INTEGER NOT NULL DEFAULT 1,
  "report_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),

  CONSTRAINT "clarity_routes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "clarity_routes_report_id_key" ON "clarity_routes"("report_id");
CREATE INDEX IF NOT EXISTS "clarity_routes_user_id_idx" ON "clarity_routes"("user_id");
CREATE INDEX IF NOT EXISTS "clarity_routes_status_idx" ON "clarity_routes"("status");

ALTER TABLE "clarity_routes"
  ADD CONSTRAINT "clarity_routes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "clarity_routes"
  ADD CONSTRAINT "clarity_routes_dialogue_id_fkey"
  FOREIGN KEY ("dialogue_id") REFERENCES "dialogues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "clarity_routes"
  ADD CONSTRAINT "clarity_routes_report_id_fkey"
  FOREIGN KEY ("report_id") REFERENCES "product_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;
