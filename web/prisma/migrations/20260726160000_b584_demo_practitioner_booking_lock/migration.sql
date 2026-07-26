-- B584 (owner 2026-07-26): «у всех практиков должно быть отключено всё время в
-- расписании — практики не существуют, они сидированные, и нельзя чтобы реальные
-- клиенты записывались к тестовым практикам».
--
-- Два действия, потому что дефект двойной: расписание открыто И запись открыта
-- принудительно (B459 ставил `booking_override_enabled` именно демо-аккаунтам).
-- Одного выключения расписания мало: правило можно вернуть из кабинета практика,
-- а разовые `time_slots` живут отдельно от правил.

ALTER TABLE "practitioners" ADD COLUMN "demo_account" BOOLEAN NOT NULL DEFAULT false;

-- Все существующие профили — сидированные: на момент миграции у каждого практика
-- почта в домене @test.eterapy.com. Домен, а не список id, потому что провижининг
-- демо-аккаунтов создаёт их по тому же правилу.
UPDATE "practitioners" p
SET "demo_account" = true
FROM "users" u
WHERE u."id" = p."userId"
  AND u."email" LIKE '%@test.eterapy.com';

-- Расписание демо-профилей выключаем — буквально то, о чём просил владелец.
-- Строки остаются: когда за профилем появится живой человек, часы не надо
-- восстанавливать заново.
UPDATE "schedule_rules" s
SET "enabled" = false
FROM "practitioners" p
WHERE p."id" = s."practitionerId"
  AND p."demo_account" = true;

-- Разовые слоты демо-профилей тоже закрываем: `/api/slots/available` отдаёт их
-- независимо от недельных правил.
UPDATE "time_slots" t
SET "available" = false
FROM "practitioners" p
WHERE p."id" = t."practitionerId"
  AND p."demo_account" = true
  AND t."available" = true;
