-- B609 (owner 2026-07-27): «если меняем названия, то и меняем URL slug, меняем
-- в суперадминке, меняем в уведомлениях и чеках. Не делаем редиректы, а именно
-- меняем».
--
-- Пять услуг меняют и видимое название, и адрес:
--   horary           → horoscope                «Хорарная астрология»      → «Гороскоп»
--   surname-story    → surname-origin           «Кармический код фамилии»  → «Происхождение фамилии»
--   family-scenarios → family-questions         «Семейные сценарии»        → «Семейные вопросы»
--   synastry         → compatibility-by-date    «Совместимость по звёздам» → «Совместимость по дате»
--   tarot-numerology → arcana                   «Арканы рождения»          → «Арканы судьбы»
--
-- Слаг `compatibility` занять было нельзя: он уже принадлежит legacy-движку
-- парной совместимости («Вместе»), и совпадение увело бы оплаченные результаты
-- в чужой продукт. Отсюда `compatibility-by-date`.
--
-- Ключ продукта лежит в трёх таблицах и в ключах настроек. Оплаченный доступ и
-- сохранённые результаты обязаны переехать вместе со слагом: иначе человек,
-- купивший «Кармический код фамилии», после выкатки увидит, что доступа нет.

UPDATE product_entitlements SET "productKey" = 'horoscope'             WHERE "productKey" = 'horary';
UPDATE product_entitlements SET "productKey" = 'surname-origin'        WHERE "productKey" = 'surname-story';
UPDATE product_entitlements SET "productKey" = 'family-questions'      WHERE "productKey" = 'family-scenarios';
UPDATE product_entitlements SET "productKey" = 'compatibility-by-date' WHERE "productKey" = 'synastry';
UPDATE product_entitlements SET "productKey" = 'arcana'                WHERE "productKey" = 'tarot-numerology';

UPDATE product_results SET product_key = 'horoscope'             WHERE product_key = 'horary';
UPDATE product_results SET product_key = 'surname-origin'        WHERE product_key = 'surname-story';
UPDATE product_results SET product_key = 'family-questions'      WHERE product_key = 'family-scenarios';
UPDATE product_results SET product_key = 'compatibility-by-date' WHERE product_key = 'synastry';
UPDATE product_results SET product_key = 'arcana'                WHERE product_key = 'tarot-numerology';

-- В `transactions` ключа продукта НЕТ: продукт там записан в описании
-- («ETerapy: surname-story»), а описание проведённого платежа — финансовая
-- история, её не переписывают. Читаемость старых ключей обеспечена в коде
-- (PRODUCT_LABELS/PRODUCT_ROUTES), а не переписыванием строк.

-- Промты продуктов: строка редактируется владельцем в суперадминке, поэтому
-- переименовывается, а не пересоздаётся — правки промта переезжают вместе с ней.
UPDATE ai_prompt_configs SET feature = 'product-horoscope',              product_key = 'horoscope'             WHERE feature = 'product-horary';
UPDATE ai_prompt_configs SET feature = 'product-surname-origin',         product_key = 'surname-origin'        WHERE feature = 'product-surname-story';
UPDATE ai_prompt_configs SET feature = 'product-family-questions',       product_key = 'family-questions'      WHERE feature = 'product-family-scenarios';
UPDATE ai_prompt_configs SET feature = 'product-compatibility-by-date',  product_key = 'compatibility-by-date' WHERE feature = 'product-synastry';
UPDATE ai_prompt_configs SET feature = 'product-arcana',                 product_key = 'arcana'                WHERE feature = 'product-tarot-numerology';

-- Цены и стоимость в баллах хранятся ключом `product.<slug>.<price|credits>`.
UPDATE platform_settings SET key = replace(key, 'product.horary.',           'product.horoscope.')             WHERE key LIKE 'product.horary.%';
UPDATE platform_settings SET key = replace(key, 'product.surname-story.',    'product.surname-origin.')        WHERE key LIKE 'product.surname-story.%';
UPDATE platform_settings SET key = replace(key, 'product.family-scenarios.', 'product.family-questions.')      WHERE key LIKE 'product.family-scenarios.%';
UPDATE platform_settings SET key = replace(key, 'product.synastry.',         'product.compatibility-by-date.') WHERE key LIKE 'product.synastry.%';
UPDATE platform_settings SET key = replace(key, 'product.tarot-numerology.', 'product.arcana.')                WHERE key LIKE 'product.tarot-numerology.%';
