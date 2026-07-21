/**
 * Ограничение входа в мини-апп на НЕбоевых стендах.
 *
 * Спрятать бота из поиска Telegram нельзя: такой настройки нет ни в Bot API, ни
 * в BotFather — бот всегда находится по @username. А стейдж ходит в базу,
 * которая почасово копируется с прода: случайный человек увидел бы там чужие
 * настоящие данные, и его собственные действия стёрла бы следующая
 * синхронизация.
 *
 * Поэтому закрывается вход, а не витрина.
 */
export function stagingTelegramAllowlist(): string[] {
  return (process.env.MINIAPP_TELEGRAM_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Боевой ли это контур. Объявляется контуром о себе (`ETERAPY_CONTOUR` в
 * `docker-compose.staging.yml`), а не угадывается по домену: значение приезжает
 * выкаткой вместе с оверлеем и его нельзя забыть проставить на хосте.
 * Переменная не задана → контур боевой, поведение прода не меняется.
 */
export function nonProductionContour(): boolean {
  const contour = process.env.ETERAPY_CONTOUR?.trim().toLowerCase();
  return contour !== undefined && contour !== "" && contour !== "production";
}

/** `@Alexey_Denisov`, `alexey_denisov`, `12345` → сопоставимый ключ. */
function allowlistKey(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

/**
 * Закрыт ли вход этому Telegram-аккаунту.
 *
 * Сверяем и числовой id, и @username: владелец задаёт список так, как знает свой
 * аккаунт («@alexey_denisov»), а числовой id человеку взять неоткуда без
 * стороннего бота. `@` и регистр значения не имеют.
 *
 * B566 — ⚠ РАЗВОРОТ РЕШЕНИЯ B554. Раньше пустой список означал «ограничения
 * нет», чтобы опечатка в .env не заперла стенд для всех, включая владельца.
 * На практике вышло хуже: список так и не доехал до хоста (его надо было
 * вписать руками), стейджевый `/api/miniapp/auth/telegram` открыт из интернета
 * в обход Basic Auth — проверено, отвечает 401 приложения, а не вызовом пароля —
 * и любой, кто нашёл стейдж-бота, попадал бы в почасовую копию боевой базы.
 * Запереть тестовый стенд от владельца несравнимо дешевле, чем показать чужие
 * настоящие данные, поэтому НЕбоевой контур без списка теперь закрыт.
 * На проде (`ETERAPY_CONTOUR` не задан) пустой список по-прежнему = нет проверки.
 */
export function stagingTelegramAccessDenied(
  telegramId: string | null | undefined,
  username?: string | null,
): boolean {
  const allowlist = stagingTelegramAllowlist().map(allowlistKey).filter(Boolean);
  if (allowlist.length === 0) return nonProductionContour();

  const identities = [telegramId, username]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map(allowlistKey);
  if (identities.length === 0) return true;

  return !identities.some((identity) => allowlist.includes(identity));
}
