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

describe("B554 (owner 2026-07-21) — список задаётся по @username", () => {
  const original = process.env.MINIAPP_TELEGRAM_ALLOWLIST;
  afterEach(() => {
    if (original === undefined) delete process.env.MINIAPP_TELEGRAM_ALLOWLIST;
    else process.env.MINIAPP_TELEGRAM_ALLOWLIST = original;
  });

  // Владелец дал «@alexey_denisov»: числовой id человеку взять неоткуда без
  // стороннего бота, поэтому сверяем и id, и username.
  it("пускает по username вне зависимости от @ и регистра", () => {
    process.env.MINIAPP_TELEGRAM_ALLOWLIST = "@alexey_denisov";
    expect(stagingTelegramAccessDenied("55501", "alexey_denisov")).toBe(false);
    expect(stagingTelegramAccessDenied("55501", "@Alexey_Denisov")).toBe(false);
    expect(stagingTelegramAccessDenied("55501", "someone_else")).toBe(true);
    expect(stagingTelegramAccessDenied("55501", null)).toBe(true);
  });

  it("числовой id продолжает работать рядом с username", () => {
    process.env.MINIAPP_TELEGRAM_ALLOWLIST = "777, @alexey_denisov";
    expect(stagingTelegramAccessDenied("777", null)).toBe(false);
    expect(stagingTelegramAccessDenied("888", "alexey_denisov")).toBe(false);
    expect(stagingTelegramAccessDenied("888", "stranger")).toBe(true);
  });
});
