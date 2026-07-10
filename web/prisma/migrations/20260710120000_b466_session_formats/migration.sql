-- B466/B480: «форматы сессий» (session-formats.ts: individual/couple/family).
-- Практик объявляет предлагаемые форматы; бронь/предложение хранят выбранный.
-- На цену не влияет (owner: «ничего в механиках нового»). individual — дефолт.

ALTER TABLE "practitioners"
  ADD COLUMN IF NOT EXISTS "formats" TEXT[] NOT NULL DEFAULT ARRAY['individual']::TEXT[];

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "format" TEXT;

ALTER TABLE "booking_proposals"
  ADD COLUMN IF NOT EXISTS "format" TEXT;
