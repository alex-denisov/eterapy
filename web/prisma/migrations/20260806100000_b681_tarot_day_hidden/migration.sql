-- B681: человек может убрать блок «карта дня» с первого экрана.
-- Вернуть показ можно только в «Настройки → Уведомления».
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "tarot_day_hidden" BOOLEAN NOT NULL DEFAULT false;
