CREATE TABLE "clarity_circles" (
  "id" TEXT NOT NULL,
  "creator_id" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "topic" TEXT,
  "status" TEXT NOT NULL DEFAULT 'INVITING',
  "invite_token" TEXT NOT NULL,
  "invite_expires_at" TIMESTAMP(3) NOT NULL,
  "teaser_text" TEXT,
  "report_id" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clarity_circles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "clarity_circle_participants" (
  "id" TEXT NOT NULL,
  "circle_id" TEXT NOT NULL,
  "user_id" TEXT,
  "display_name" TEXT,
  "answer_text" TEXT NOT NULL,
  "consent" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "risk_score" INTEGER NOT NULL DEFAULT 0,
  "risk_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "clarity_circle_participants_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "compatibilities" ADD COLUMN "invite_expires_at" TIMESTAMP(3);
ALTER TABLE "compatibilities" ADD COLUMN "creator_dialogue_id" TEXT;
ALTER TABLE "compatibilities" ADD COLUMN "partner_dialogue_id" TEXT;
ALTER TABLE "compatibilities" ADD COLUMN "teaser_text" TEXT;
ALTER TABLE "compatibilities" ADD COLUMN "risk_score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "compatibilities" ADD COLUMN "risk_flags" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE UNIQUE INDEX "clarity_circles_invite_token_key" ON "clarity_circles"("invite_token");
CREATE UNIQUE INDEX "clarity_circles_report_id_key" ON "clarity_circles"("report_id");
CREATE INDEX "clarity_circles_creator_id_status_created_at_idx" ON "clarity_circles"("creator_id", "status", "created_at");
CREATE INDEX "clarity_circles_invite_token_idx" ON "clarity_circles"("invite_token");
CREATE INDEX "clarity_circles_invite_expires_at_idx" ON "clarity_circles"("invite_expires_at");
CREATE UNIQUE INDEX "clarity_circle_participants_circle_id_user_id_key" ON "clarity_circle_participants"("circle_id", "user_id");
CREATE INDEX "clarity_circle_participants_circle_id_status_created_at_idx" ON "clarity_circle_participants"("circle_id", "status", "created_at");
CREATE INDEX "clarity_circle_participants_user_id_idx" ON "clarity_circle_participants"("user_id");
CREATE INDEX "compatibilities_invite_expires_at_idx" ON "compatibilities"("invite_expires_at");

ALTER TABLE "clarity_circles" ADD CONSTRAINT "clarity_circles_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clarity_circles" ADD CONSTRAINT "clarity_circles_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "product_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "clarity_circle_participants" ADD CONSTRAINT "clarity_circle_participants_circle_id_fkey" FOREIGN KEY ("circle_id") REFERENCES "clarity_circles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clarity_circle_participants" ADD CONSTRAINT "clarity_circle_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
