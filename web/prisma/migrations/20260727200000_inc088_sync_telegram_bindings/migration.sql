-- INC-088: свести две привязки Telegram в одну.
--
-- До этого `platform_identities` (вход из Mini App) и `users."telegramId"`
-- (адрес доставки уведомлений) жили порознь: человек, связавший аккаунт из
-- Mini App, в разделе «Уведомления» оставался «не привязан» и не получал ничего.
--
-- Здесь достраивается недостающая половина ТОЛЬКО там, где это однозначно:
-- у пользователя ещё нет своего `telegramId`, и этот chat_id не занят никем
-- другим. Спорные случаи (один Telegram разведён по разным аккаунтам)
-- миграция не трогает — их разбирает оператор через админку.
UPDATE users u
SET "telegramId" = pi.subject_id,
    "telegramUsername" = COALESCE(u."telegramUsername", pi.username)
FROM platform_identities pi
WHERE pi.provider = 'telegram'
  AND pi.user_id = u.id
  AND u."telegramId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM users other
    WHERE other."telegramId" = pi.subject_id
  );
