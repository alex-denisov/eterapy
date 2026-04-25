-- Backlog 11.C.3: link payouts to the booking that generated them so the
-- complaint-resolution flow can find and act on the HELD payout for a given
-- booking (release / withhold).
ALTER TABLE "payouts" ADD COLUMN "bookingId" TEXT;

CREATE INDEX "payouts_bookingId_idx" ON "payouts"("bookingId");

ALTER TABLE "payouts"
  ADD CONSTRAINT "payouts_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "bookings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
