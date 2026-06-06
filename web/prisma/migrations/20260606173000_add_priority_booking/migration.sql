-- Z20: Premium priority booking, early slot access, and waitlist promotion.

CREATE TYPE "WaitlistStatus" AS ENUM ('ACTIVE', 'PROMOTED', 'CANCELLED', 'EXPIRED');

ALTER TABLE "time_slots"
  ADD COLUMN "visible_from" TIMESTAMP(3),
  ADD COLUMN "early_access_from" TIMESTAMP(3);

ALTER TABLE "bookings"
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "bookings_priority_createdAt_idx"
  ON "bookings"("priority", "createdAt");

CREATE TABLE "booking_waitlist_entries" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "practitionerId" TEXT NOT NULL,
  "slotId" TEXT,
  "start_at" TIMESTAMP(3) NOT NULL,
  "end_at" TIMESTAMP(3) NOT NULL,
  "status" "WaitlistStatus" NOT NULL DEFAULT 'ACTIVE',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "plan_key" TEXT,
  "promoted_booking_id" TEXT,
  "promoted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "booking_waitlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_waitlist_client_window_status_key"
  ON "booking_waitlist_entries"("clientId", "practitionerId", "start_at", "end_at", "status");

CREATE INDEX "time_slots_available_visible_from_early_access_from_idx"
  ON "time_slots"("available", "visible_from", "early_access_from");

CREATE INDEX "booking_waitlist_entries_clientId_status_start_at_idx"
  ON "booking_waitlist_entries"("clientId", "status", "start_at");

CREATE INDEX "booking_waitlist_entries_practitionerId_status_start_at_priority_created_at_idx"
  ON "booking_waitlist_entries"("practitionerId", "status", "start_at", "priority", "created_at");

CREATE INDEX "booking_waitlist_entries_slotId_status_priority_created_at_idx"
  ON "booking_waitlist_entries"("slotId", "status", "priority", "created_at");

CREATE INDEX "booking_waitlist_entries_promoted_booking_id_idx"
  ON "booking_waitlist_entries"("promoted_booking_id");

ALTER TABLE "booking_waitlist_entries"
  ADD CONSTRAINT "booking_waitlist_entries_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_waitlist_entries"
  ADD CONSTRAINT "booking_waitlist_entries_practitionerId_fkey"
  FOREIGN KEY ("practitionerId") REFERENCES "practitioners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_waitlist_entries"
  ADD CONSTRAINT "booking_waitlist_entries_slotId_fkey"
  FOREIGN KEY ("slotId") REFERENCES "time_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "booking_waitlist_entries"
  ADD CONSTRAINT "booking_waitlist_entries_promoted_booking_id_fkey"
  FOREIGN KEY ("promoted_booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
