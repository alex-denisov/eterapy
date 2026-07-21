/**
 * Ограничение входа в мини-апп на НЕбоевых стендах.
 *
 * Спрятать бота из поиска Telegram нельзя: такой настройки нет ни в Bot API, ни
 * в BotFather — бот всегда находится по @username. А стейдж ходит в базу,
 * которая почасово копируется с прода: случайный человек увидел бы там чужие
 * настоящие данные, и его собственные действия стёрла бы следующая
 * синхронизация.
 *
 * Поэтому закрывается вход, а не витрина. Список пуст (переменная не задана) —
 * ограничения нет вовсе, так что на проде эта логика не действует.
 */
export function stagingTelegramAllowlist(): string[] {
  return (process.env.MINIAPP_TELEGRAM_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
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
 * Список из одних разделителей («, ,») трактуется как ОТСУТСТВИЕ списка:
 * опечатка в .env не должна запирать стенд для всех, включая владельца.
 */
export function stagingTelegramAccessDenied(
  telegramId: string | null | undefined,
  username?: string | null,
): boolean {
  const allowlist = stagingTelegramAllowlist().map(allowlistKey).filter(Boolean);
  if (allowlist.length === 0) return false;

  const identities = [telegramId, username]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map(allowlistKey);
  if (identities.length === 0) return true;

  return !identities.some((identity) => allowlist.includes(identity));
}
