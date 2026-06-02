-- W3: three-level practitioner taxonomy (category → direction → tasks)
-- Adds explicit category/direction arrays; `tags` is reused for level-3 задачи.

ALTER TABLE "practitioners"
  ADD COLUMN IF NOT EXISTS "categories" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "directions" TEXT[] NOT NULL DEFAULT '{}';

-- ── Backfill categories from existing data ───────────────────────────────────
-- Esoteric: any practitioner that already has a Specialty enum value.
UPDATE "practitioners"
   SET "categories" = ARRAY['esoteric']
 WHERE array_length("specialties", 1) > 0
   AND NOT ('esoteric' = ANY("categories"));

-- Title-keyword inference (additive — a practitioner can hold several).
UPDATE "practitioners"
   SET "categories" = "categories" || ARRAY['psychology']
 WHERE (lower("title") LIKE '%психолог%' OR lower("title") LIKE '%терапевт%' OR lower("title") LIKE '%психиатр%')
   AND NOT ('psychology' = ANY("categories"));

UPDATE "practitioners"
   SET "categories" = "categories" || ARRAY['coaching']
 WHERE lower("title") LIKE '%коуч%'
   AND NOT ('coaching' = ANY("categories"));

UPDATE "practitioners"
   SET "categories" = "categories" || ARRAY['legal']
 WHERE (lower("title") LIKE '%юрист%' OR lower("title") LIKE '%адвокат%' OR lower("title") LIKE '%правов%')
   AND NOT ('legal' = ANY("categories"));

UPDATE "practitioners"
   SET "categories" = "categories" || ARRAY['finance']
 WHERE (lower("title") LIKE '%финанс%' OR lower("title") LIKE '%бухгалтер%' OR lower("title") LIKE '%эконом%')
   AND NOT ('finance' = ANY("categories"));

-- ── Backfill esoteric directions from Specialty enum ─────────────────────────
UPDATE "practitioners" SET "directions" = "directions" || ARRAY['tarot']
 WHERE 'TAROT' = ANY("specialties"::text[]) AND NOT ('tarot' = ANY("directions"));
UPDATE "practitioners" SET "directions" = "directions" || ARRAY['astrology']
 WHERE 'ASTROLOGY' = ANY("specialties"::text[]) AND NOT ('astrology' = ANY("directions"));
UPDATE "practitioners" SET "directions" = "directions" || ARRAY['numerology']
 WHERE 'NUMEROLOGY' = ANY("specialties"::text[]) AND NOT ('numerology' = ANY("directions"));
UPDATE "practitioners" SET "directions" = "directions" || ARRAY['psychic']
 WHERE 'PSYCHIC' = ANY("specialties"::text[]) AND NOT ('psychic' = ANY("directions"));
UPDATE "practitioners" SET "directions" = "directions" || ARRAY['runes']
 WHERE 'RUNES' = ANY("specialties"::text[]) AND NOT ('runes' = ANY("directions"));
UPDATE "practitioners" SET "directions" = "directions" || ARRAY['dreams']
 WHERE 'DREAMS' = ANY("specialties"::text[]) AND NOT ('dreams' = ANY("directions"));
