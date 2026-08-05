-- B676 — Алиса Бабаева становится полноценным специалистом; цена сессии у всех
-- остальных приводится к одному значению (решение владельца 2026-08-05).
--
-- Что здесь происходит и почему именно так:
--
-- 1. `bookable_from` — новая колонка. Расписание в системе описано НЕДЕЛЬНЫМИ
--    правилами без дат (`schedule_rules`), слоты считаются на лету, поэтому
--    «открыть запись с 10 сентября» иначе выражается только блокировками до
--    бесконечности. `null` = ограничения нет, поведение прежнее.
--
-- 2. Профиль Алисы переписывается по её собственному сайту (alisababaeva.ru),
--    а не по демо-заготовке, доставшейся от «Елены Морозовой». Она ПСИХОЛОГ
--    (КПТ, гештальт, интегральный и провокативный методы), а не таролог:
--    B665 оставила ей эзотерическую витрину прошлого владельца профиля.
--    `specialties` — эзотерический enum, у психолога он пустой; каталог
--    фильтрует по `categories`/`directions`.
--
-- 3. Отзывы возвращаются ТЕ ЖЕ, что были до B665 — восстановлены из шифрованной
--    копии `eterapy-1-eterapy-20260805T030157Z.dump.gpg` (снята до выкатки
--    B665). Владелец 2026-08-05: «Отзывы верни какие были, они обязательны».
--    Тексты не называют имён, поэтому переносятся дословно. Счётчики
--    возвращаются к дореформенным: ratingSum 73, reviewCount 15,
--    sessionCount 120.
--
-- 4. Цена: у Алисы 10 000 ₽ за 60 минут и НИКАКИХ других вариантов
--    (`sessionDuration` было 45). У всех остальных — 9 000 ₽ за 60 минут,
--    слоты им не открываются: они остаются `demo_account = true`.
--
-- Миграция идемпотентна: повторный прогон перезапишет те же значения и не
-- продублирует отзывы (`ON CONFLICT DO NOTHING` по первичному ключу).

ALTER TABLE practitioners ADD COLUMN IF NOT EXISTS bookable_from TIMESTAMP(3);

-- ── 1. Все специалисты: 60 минут по 9 000 ₽ ──────────────────────────────────
UPDATE practitioners
SET "pricePerSession" = 9000,
    "sessionDuration" = 60;

-- ── 2. Алиса Бабаева: реальный профиль, цена, открытие записи ────────────────
UPDATE practitioners
SET title = 'Психолог-консультант · КПТ, гештальт, интегральная терапия',
    bio = 'Работаю в интегральном подходе и опираюсь на четыре школы — когнитивно-поведенческую и гештальт-терапию, интегральную и провокативную терапию. В практике взрослые женщины, пары и семьи: тревога, депрессия и апатия, зависимости, компульсивное переедание, пограничное расстройство личности. Помогаю не «починить» себя, а увидеть, как можно жить иначе. Работаю онлайн, без оценок и советов, с вниманием к вашему темпу.',
    experience = '10 лет',
    -- Эзотерический enum у психолога пуст; витрину держат taxonomy-колонки.
    specialties = ARRAY[]::"Specialty"[],
    categories = ARRAY['psychology'],
    directions = ARRAY['cbt', 'gestalt', 'integrative'],
    tags = ARRAY['Тревога', 'Депрессия и апатия', 'Зависимости', 'Отношения', 'Компульсивное переедание'],
    formats = ARRAY['individual', 'couple', 'family'],
    "pricePerSession" = 10000,
    "sessionDuration" = 60,
    languages = ARRAY['Русский'],
    -- Онбординг завершён: живой специалист, а не витрина.
    demo_account = false,
    status = 'ACTIVE',
    verified = true,
    "verifiedAt" = COALESCE("verifiedAt", NOW()),
    agent_offer_accepted_at = COALESCE(agent_offer_accepted_at, NOW()),
    agent_offer_version = COALESCE(agent_offer_version, 'v1'),
    -- Запись открывается 10 сентября 2026 (00:00 MSK = 2026-09-09 21:00 UTC).
    bookable_from = TIMESTAMP '2026-09-09 21:00:00'
WHERE slug = 'alisa-babaeva';

-- ── 3. Недельное расписание: будни 10:00–19:00 ───────────────────────────────
-- Правила существуют всегда, но до `bookable_from` слотов не будет: гейт стоит
-- в выдаче доступности, а не в данных расписания.
INSERT INTO schedule_rules (id, "practitionerId", "dayOfWeek", "startHour", "startMinute", "endHour", "endMinute", enabled)
SELECT 'sr_alisa_' || d, p.id, d, 10, 0, 19, 0, true
FROM practitioners p, generate_series(1, 5) AS d
WHERE p.slug = 'alisa-babaeva'
ON CONFLICT ("practitionerId", "dayOfWeek") DO UPDATE
SET "startHour" = 10, "startMinute" = 0, "endHour" = 19, "endMinute" = 0, enabled = true;

-- Выходные закрыты явно, а не отсутствием строки: пустая строка и выключенное
-- правило читаются одинаково в выдаче, но по-разному в кабинете практика.
INSERT INTO schedule_rules (id, "practitionerId", "dayOfWeek", "startHour", "startMinute", "endHour", "endMinute", enabled)
SELECT 'sr_alisa_' || d, p.id, d, 10, 0, 19, 0, false
FROM practitioners p, unnest(ARRAY[0, 6]) AS d
WHERE p.slug = 'alisa-babaeva'
ON CONFLICT ("practitionerId", "dayOfWeek") DO NOTHING;

-- ── 4. Отзывы — ровно те, что были до B665 ──────────────────────────────────
INSERT INTO reviews (id, "bookingId", "authorId", "practitionerId", rating, text, "createdAt", status, risk_score, risk_flags)
SELECT v.id, v."bookingId", v."authorId", p.id, v.rating, v.text, v."createdAt", 'PUBLISHED', 0, ARRAY[]::text[]
FROM practitioners p,
  (VALUES
    ('seed_rv_cmo2tqzmf00005iwk10hqp8hg_1',  'seed_bk_cmo2tqzmf00005iwk10hqp8hg_1',  'cmo3956yt000cu0wkpgw1khu0', 5, 'Спокойный профессиональный разговор без давления. Рекомендую.',           TIMESTAMP '2026-05-25 13:07:04.385'),
    ('seed_rv_cmo2tqzmf00005iwk10hqp8hg_2',  'seed_bk_cmo2tqzmf00005iwk10hqp8hg_2',  'cmo5vonk70001q9wky07dwh8e', 5, 'Конкретные шаги и поддержка — ушёл с ясностью.',                          TIMESTAMP '2026-05-20 13:07:04.385'),
    ('seed_rv_cmo2tqzmf00005iwk10hqp8hg_3',  'seed_bk_cmo2tqzmf00005iwk10hqp8hg_3',  'cmo3bst0m000gu0wktt4w8atr', 5, 'Чувствовалась настоящая включённость, ни одной банальности.',             TIMESTAMP '2026-05-15 13:07:04.385'),
    ('seed_rv_cmo2tqzmf00005iwk10hqp8hg_4',  'seed_bk_cmo2tqzmf00005iwk10hqp8hg_4',  'test-client-001',           5, 'Помогло разложить запутанную ситуацию по полочкам.',                      TIMESTAMP '2026-05-10 13:07:04.385'),
    ('seed_rv_cmo2tqzmf00005iwk10hqp8hg_5',  'seed_bk_cmo2tqzmf00005iwk10hqp8hg_5',  'cmo390zw70009u0wk6yi3bcpm', 5, 'Тёплая атмосфера, всё по делу, без эзотерического тумана.',               TIMESTAMP '2026-05-05 13:07:04.385'),
    ('seed_rv_cmo2tqzmf00005iwk10hqp8hg_6',  'seed_bk_cmo2tqzmf00005iwk10hqp8hg_6',  'cmo3956yt000cu0wkpgw1khu0', 4, 'Дала практичный маленький шаг, который реально сработал.',                TIMESTAMP '2026-04-30 13:07:04.385'),
    ('seed_rv_cmo2tqzmf00005iwk10hqp8hg_7',  'seed_bk_cmo2tqzmf00005iwk10hqp8hg_7',  'cmo5vonk70001q9wky07dwh8e', 5, 'Очень точные вопросы, после встречи стало легче.',                        TIMESTAMP '2026-04-25 13:07:04.385'),
    ('seed_rv_cmo2tqzmf00005iwk10hqp8hg_8',  'seed_bk_cmo2tqzmf00005iwk10hqp8hg_8',  'cmo3bst0m000gu0wktt4w8atr', 5, 'Очень бережная и внимательная встреча, помогла увидеть ситуацию иначе.',  TIMESTAMP '2026-04-20 13:07:04.385'),
    ('seed_rv_cmo2tqzmf00005iwk10hqp8hg_9',  'seed_bk_cmo2tqzmf00005iwk10hqp8hg_9',  'test-client-001',           5, 'Спокойный профессиональный разговор без давления. Рекомендую.',           TIMESTAMP '2026-04-15 13:07:04.385'),
    ('seed_rv_cmo2tqzmf00005iwk10hqp8hg_10', 'seed_bk_cmo2tqzmf00005iwk10hqp8hg_10', 'cmo390zw70009u0wk6yi3bcpm', 5, 'Конкретные шаги и поддержка — ушёл с ясностью.',                          TIMESTAMP '2026-04-10 13:07:04.385'),
    ('seed_rv_cmo2tqzmf00005iwk10hqp8hg_11', 'seed_bk_cmo2tqzmf00005iwk10hqp8hg_11', 'cmo3956yt000cu0wkpgw1khu0', 5, 'Чувствовалась настоящая включённость, ни одной банальности.',             TIMESTAMP '2026-04-05 13:07:04.385'),
    ('seed_rv_cmo2tqzmf00005iwk10hqp8hg_12', 'seed_bk_cmo2tqzmf00005iwk10hqp8hg_12', 'cmo5vonk70001q9wky07dwh8e', 4, 'Помогло разложить запутанную ситуацию по полочкам.',                      TIMESTAMP '2026-03-31 13:07:04.385'),
    ('seed_rv_cmo2tqzmf00005iwk10hqp8hg_13', 'seed_bk_cmo2tqzmf00005iwk10hqp8hg_13', 'cmo3bst0m000gu0wktt4w8atr', 5, 'Тёплая атмосфера, всё по делу, без эзотерического тумана.',               TIMESTAMP '2026-03-26 13:07:04.385'),
    ('seed_rv_cmo2tqzmf00005iwk10hqp8hg_14', 'seed_bk_cmo2tqzmf00005iwk10hqp8hg_14', 'test-client-001',           5, 'Дала практичный маленький шаг, который реально сработал.',                TIMESTAMP '2026-03-21 13:07:04.385'),
    ('seed_rv_cmo2tqzmf00005iwk10hqp8hg_15', 'seed_bk_cmo2tqzmf00005iwk10hqp8hg_15', 'cmo390zw70009u0wk6yi3bcpm', 5, 'Очень точные вопросы, после встречи стало легче.',                        TIMESTAMP '2026-03-16 13:07:04.385')
  ) AS v(id, "bookingId", "authorId", rating, text, "createdAt")
WHERE p.slug = 'alisa-babaeva'
  -- Отзыв нельзя вставить без своего бронирования: строка `reviews` ссылается
  -- на `bookings` внешним ключом, а не хранит имя автора.
  AND EXISTS (SELECT 1 FROM bookings b WHERE b.id = v."bookingId")
  AND EXISTS (SELECT 1 FROM users u WHERE u.id = v."authorId")
ON CONFLICT (id) DO NOTHING;

-- Счётчики пересчитываются из фактических строк, а не проставляются числом:
-- если какое-то бронирование на проде не найдётся, витрина не соврёт.
UPDATE practitioners p
SET "ratingSum" = COALESCE(agg.sum, 0),
    "reviewCount" = COALESCE(agg.cnt, 0),
    "sessionCount" = COALESCE(
      (SELECT count(*) FROM bookings b WHERE b."practitionerId" = p.id AND b.status = 'COMPLETED'),
      0
    )
FROM (
  SELECT r."practitionerId" AS pid, sum(r.rating)::double precision AS sum, count(*)::int AS cnt
  FROM reviews r GROUP BY r."practitionerId"
) AS agg
WHERE agg.pid = p.id AND p.slug = 'alisa-babaeva';
