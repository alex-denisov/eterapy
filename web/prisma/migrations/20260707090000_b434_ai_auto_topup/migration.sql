-- B434: авто-докупка минимального пакета AI-разборов при исчерпании квоты
-- (owner: default OFF).
ALTER TABLE "practitioners"
  ADD COLUMN "ai_auto_topup" BOOLEAN NOT NULL DEFAULT false;
