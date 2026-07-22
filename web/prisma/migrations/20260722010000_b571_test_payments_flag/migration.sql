-- B571: признак «тестовые платежи» у пользователя и режим ключей на транзакции.
ALTER TABLE "users" ADD COLUMN "test_payments_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "transactions" ADD COLUMN "test_mode" BOOLEAN NOT NULL DEFAULT false;
