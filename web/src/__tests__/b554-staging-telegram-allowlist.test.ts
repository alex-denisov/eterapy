import { stagingTelegramAccessDenied } from "@/lib/miniapp/staging-allowlist";

/**
 * B554 (owner 2026-07-21): «Скрой stage телеграм бота из поиска».
 *
 * Спрятать бота из поиска Telegram нельзя — такой настройки нет ни в Bot API,
 * ни в BotFather: бот всегда находится по @username. Опасность при этом
 * реальная: стейдж ходит в БД, которая ПОЧАСОВО КОПИРУЕТСЯ С ПРОДА, поэтому
 * случайный человек увидел бы там чужие настоящие данные, а его собственные
 * действия стёрла бы следующая синхронизация.
 *
 * Поэтому закрываем не витрину, а вход: на стейдже пускаем только заранее
 * названные Telegram-идентификаторы.
 */
describe("B554 — вход в стейджевый мини-апп по списку", () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it("на проде не действует вообще — список там не задан", () => {
    delete process.env.MINIAPP_TELEGRAM_ALLOWLIST;
    expect(stagingTelegramAccessDenied("123")).toBe(false);
    expect(stagingTelegramAccessDenied("999")).toBe(false);
  });

  it("пускает своих и отсекает чужих, когда список задан", () => {
    process.env.MINIAPP_TELEGRAM_ALLOWLIST = "111,222";
    expect(stagingTelegramAccessDenied("111")).toBe(false);
    expect(stagingTelegramAccessDenied("222")).toBe(false);
    expect(stagingTelegramAccessDenied("333")).toBe(true);
  });

  it("терпит пробелы и пустые элементы в переменной окружения", () => {
    process.env.MINIAPP_TELEGRAM_ALLOWLIST = " 111 , ,222 ,";
    expect(stagingTelegramAccessDenied("111")).toBe(false);
    expect(stagingTelegramAccessDenied("222")).toBe(false);
    expect(stagingTelegramAccessDenied("333")).toBe(true);
  });

  it("список из одних разделителей не превращается в глухую стену", () => {
    // Иначе опечатка в .env закрыла бы стейдж вообще для всех, включая владельца.
    process.env.MINIAPP_TELEGRAM_ALLOWLIST = " , , ";
    expect(stagingTelegramAccessDenied("111")).toBe(false);
  });

  it("без идентификатора доступ закрыт, когда список задан", () => {
    process.env.MINIAPP_TELEGRAM_ALLOWLIST = "111";
    expect(stagingTelegramAccessDenied(null)).toBe(true);
    expect(stagingTelegramAccessDenied("")).toBe(true);
  });
});
