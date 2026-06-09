-- B359 / Интерфейс 11: track when the practitioner last viewed their reviews so
-- the «новых отзывов» sidebar badge resets after viewing (was a rolling window).
ALTER TABLE "practitioners"
  ADD COLUMN "reviewsSeenAt" TIMESTAMP(3);
