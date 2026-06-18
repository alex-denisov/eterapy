-- B428: record where date of birth came from (manual profile edit, VK, or other
-- verified source). Nullable for existing users and users without DOB.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "birth_date_source" TEXT;
