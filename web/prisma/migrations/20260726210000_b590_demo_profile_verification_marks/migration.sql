-- B590 (owner 2026-07-26): «для тех что остались на платформе нужно поставить
-- все признаки прохождения проверки, пусть будут как специалисты, но пока без
-- доступных окон записи».
--
-- Каталог обещает проверку диплома, опыта и подписанный этический кодекс. У
-- четвёрки, оставленной B588, этот набор был проставлен наполовину: `verified`
-- стоял у всех, а `verifiedAt` — только у одного профиля из четырёх.
--
-- Механика проверок НЕ меняется: `assertPractitionerBookingAllowed` работает
-- как работал. Запись остаётся закрытой флагом `demo_account` (B584), который
-- сильнее и `bookingOverrideEnabled`, и любого из признаков ниже.
--
-- Чего здесь намеренно нет: `tax_status`, `tax_review_status`, реквизитов
-- выплат и ИНН. Это не проверка ETerapy, а утверждение о налоговой регистрации
-- конкретного человека — оно печатается на публичной странице строкой
-- «Статус: … · ИНН …». За этими профилями людей нет.

UPDATE "practitioners" p
SET "verified" = true,
    "verifiedAt" = COALESCE(p."verifiedAt", TIMESTAMP '2026-07-26 00:00:00')
FROM "users" u
WHERE u."id" = p."userId"
  AND lower(u."email") IN (
    'practitioner@test.eterapy.com',
    'tarot@test.eterapy.com',
    'psy-cbt@test.eterapy.com',
    'psy-family@test.eterapy.com'
  );

-- Отключённые B588 профили не должны нести признак пройденной проверки: они не
-- показываются, но данные обязаны быть честными на случай возврата в каталог.
UPDATE "practitioners" p
SET "verified" = false,
    "verifiedAt" = NULL
FROM "users" u
WHERE u."id" = p."userId"
  AND p."demo_account" = true
  AND lower(u."email") NOT IN (
    'practitioner@test.eterapy.com',
    'tarot@test.eterapy.com',
    'psy-cbt@test.eterapy.com',
    'psy-family@test.eterapy.com'
  );

-- B584 держит запись закрытой флагом, но оставшийся `bookingOverrideEnabled`
-- вводит в заблуждение в карточке суперадминки («запись открыта вручную»).
-- Снимаем: сиды его уже не ставят (B588), в БД он остался от B459.
UPDATE "practitioners"
SET "booking_override_enabled" = false,
    "booking_override_at" = NULL
WHERE "demo_account" = true;
