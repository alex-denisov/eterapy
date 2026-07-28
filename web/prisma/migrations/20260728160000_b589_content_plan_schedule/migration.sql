-- B589: у каждого слота контент-плана есть видимая плановая дата.
-- Первый выпуск — понедельник 03.08.2026, 12:00 МСК; дальше раз в неделю.
UPDATE "external_publications"
SET "scheduled_for" = CASE "plan_slot"
  WHEN 'b589-w1-vk-vernetsya-li-byvshiy' THEN TIMESTAMP '2026-08-03 09:00:00'
  WHEN 'b589-w1-vk-kak-perezhit-rasstavanie' THEN TIMESTAMP '2026-08-10 09:00:00'
  WHEN 'b589-w1-tg-ne-mogu-zabyt-byvshego' THEN TIMESTAMP '2026-08-17 09:00:00'
  WHEN 'b589-w1-vk-budem-li-my-vmeste' THEN TIMESTAMP '2026-08-24 09:00:00'
  WHEN 'b589-w1-vk-stoit-li-uvolnyatsya' THEN TIMESTAMP '2026-08-31 09:00:00'
  WHEN 'b589-w1-vk-vygoranie-na-rabote' THEN TIMESTAMP '2026-09-07 09:00:00'
  WHEN 'b589-w1-tg-mne-ochen-odinoko' THEN TIMESTAMP '2026-09-14 09:00:00'
  WHEN 'b589-w1-vk-ne-mogu-nayti-sebya' THEN TIMESTAMP '2026-09-21 09:00:00'
  ELSE "scheduled_for"
END
WHERE "plan_slot" IS NOT NULL
  AND "scheduled_for" IS NULL;
