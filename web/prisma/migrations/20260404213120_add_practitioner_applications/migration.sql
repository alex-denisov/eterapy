CREATE TABLE "practitioner_applications" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "email"       TEXT NOT NULL,
  "telegram"    TEXT,
  "specialties" TEXT[] NOT NULL DEFAULT '{}',
  "experience"  TEXT NOT NULL,
  "formats"     TEXT[] NOT NULL DEFAULT '{}',
  "about"       TEXT NOT NULL,
  "why"         TEXT,
  "portfolio"   TEXT,
  "status"      TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "practitioner_applications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "practitioner_applications_email_idx" ON "practitioner_applications"("email");
CREATE INDEX "practitioner_applications_status_createdAt_idx" ON "practitioner_applications"("status", "createdAt");
