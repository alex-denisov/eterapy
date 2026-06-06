-- Z18: BYOC source axis, practitioner invites, immutable first-touch attribution, and sticky client links.
CREATE TYPE "ClientSource" AS ENUM ('PLATFORM', 'BYOC');

ALTER TABLE "practitioners"
  ADD COLUMN "byocCommissionPercent" INTEGER NOT NULL DEFAULT 14,
  ADD COLUMN "isFoundingCohort" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "foundingUntil" TIMESTAMP(3);

ALTER TABLE "bookings"
  ADD COLUMN "source" "ClientSource" NOT NULL DEFAULT 'PLATFORM',
  ADD COLUMN "referrerPractitionerId" TEXT;

CREATE TABLE "practitioner_invites" (
  "id" TEXT NOT NULL,
  "practitioner_id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "label" TEXT NOT NULL DEFAULT 'Основная ссылка',
  "free_ai_hook" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "opened_count" INTEGER NOT NULL DEFAULT 0,
  "registered_count" INTEGER NOT NULL DEFAULT 0,
  "booked_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "practitioner_invites_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "practitioner_invite_visits" (
  "id" TEXT NOT NULL,
  "invite_id" TEXT NOT NULL,
  "visitor_hash" TEXT NOT NULL,
  "referred_user_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPENED',
  "blocked_reason" TEXT,
  "risk_score" INTEGER NOT NULL DEFAULT 0,
  "risk_flags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "ip_hash" TEXT,
  "user_agent_hash" TEXT,
  "device_hash" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "practitioner_invite_visits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_attributions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "first_touch_source" "ClientSource" NOT NULL DEFAULT 'PLATFORM',
  "first_touch_invite_id" TEXT,
  "first_touch_practitioner_id" TEXT,
  "first_touch_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_attributions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "client_practitioner_links" (
  "id" TEXT NOT NULL,
  "client_id" TEXT NOT NULL,
  "practitioner_id" TEXT NOT NULL,
  "source" "ClientSource" NOT NULL DEFAULT 'BYOC',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "last_booking_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_practitioner_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "practitioner_invites_token_key" ON "practitioner_invites"("token");
CREATE INDEX "practitioner_invites_practitioner_id_status_idx" ON "practitioner_invites"("practitioner_id", "status");

CREATE UNIQUE INDEX "practitioner_invite_visits_invite_id_visitor_hash_key" ON "practitioner_invite_visits"("invite_id", "visitor_hash");
CREATE INDEX "practitioner_invite_visits_referred_user_id_idx" ON "practitioner_invite_visits"("referred_user_id");
CREATE INDEX "practitioner_invite_visits_status_created_at_idx" ON "practitioner_invite_visits"("status", "created_at");
CREATE INDEX "practitioner_invite_visits_ip_hash_created_at_idx" ON "practitioner_invite_visits"("ip_hash", "created_at");
CREATE INDEX "practitioner_invite_visits_device_hash_created_at_idx" ON "practitioner_invite_visits"("device_hash", "created_at");

CREATE UNIQUE INDEX "client_attributions_user_id_key" ON "client_attributions"("user_id");
CREATE INDEX "client_attributions_first_touch_source_first_touch_at_idx" ON "client_attributions"("first_touch_source", "first_touch_at");
CREATE INDEX "client_attributions_first_touch_practitioner_id_idx" ON "client_attributions"("first_touch_practitioner_id");
CREATE INDEX "client_attributions_first_touch_invite_id_idx" ON "client_attributions"("first_touch_invite_id");

CREATE UNIQUE INDEX "client_practitioner_links_client_id_practitioner_id_key" ON "client_practitioner_links"("client_id", "practitioner_id");
CREATE INDEX "client_practitioner_links_practitioner_id_status_idx" ON "client_practitioner_links"("practitioner_id", "status");
CREATE INDEX "client_practitioner_links_client_id_status_idx" ON "client_practitioner_links"("client_id", "status");
CREATE INDEX "client_practitioner_links_source_expires_at_idx" ON "client_practitioner_links"("source", "expires_at");

CREATE INDEX "bookings_source_createdAt_idx" ON "bookings"("source", "createdAt");
CREATE INDEX "bookings_referrerPractitionerId_createdAt_idx" ON "bookings"("referrerPractitionerId", "createdAt");

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_referrerPractitionerId_fkey"
  FOREIGN KEY ("referrerPractitionerId") REFERENCES "practitioners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "practitioner_invites"
  ADD CONSTRAINT "practitioner_invites_practitioner_id_fkey"
  FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "practitioner_invite_visits"
  ADD CONSTRAINT "practitioner_invite_visits_invite_id_fkey"
  FOREIGN KEY ("invite_id") REFERENCES "practitioner_invites"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "practitioner_invite_visits_referred_user_id_fkey"
  FOREIGN KEY ("referred_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_attributions"
  ADD CONSTRAINT "client_attributions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "client_attributions_first_touch_invite_id_fkey"
  FOREIGN KEY ("first_touch_invite_id") REFERENCES "practitioner_invites"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "client_attributions_first_touch_practitioner_id_fkey"
  FOREIGN KEY ("first_touch_practitioner_id") REFERENCES "practitioners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "client_practitioner_links"
  ADD CONSTRAINT "client_practitioner_links_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "client_practitioner_links_practitioner_id_fkey"
  FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
