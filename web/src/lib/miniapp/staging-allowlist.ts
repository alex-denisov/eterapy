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

/**
 * Закрыт ли вход этому Telegram-идентификатору.
 *
 * Список из одних разделителей («, ,») трактуется как ОТСУТСТВИЕ списка:
 * опечатка в .env не должна запирать стенд для всех, включая владельца.
 */
export function stagingTelegramAccessDenied(telegramId: string | null | undefined): boolean {
  const allowlist = stagingTelegramAllowlist();
  if (allowlist.length === 0) return false;
  if (!telegramId) return true;
  return !allowlist.includes(String(telegramId).trim());
}
