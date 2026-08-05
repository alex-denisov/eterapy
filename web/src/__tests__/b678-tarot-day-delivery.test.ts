/**
 * B678 — доставка карты дня в Telegram-бот.
 *
 * Здесь проверяется граница, которую не видно ни в одном интерфейсе: событие
 * `DAILY_CARD` теперь несёт ДВА разных содержимого — старую «Ежедневную
 * практику» и новую карту Таро. Если ветка разъедется, человек получит пустое
 * сообщение или карту без трактовки, а журнал доставки при этом покажет `sent`.
 */
import { formatTelegramMessage } from "@/lib/notification-delivery";
import { tarotDayDeliveryKey, tarotDayDeliveryPrefix } from "@/lib/tarot-day-broadcast";

const TAROT_DATA = {
  cardName: "Звезда",
  reversed: "0",
  headline: "Тихое восстановление",
  body: "Карта говорит о возвращении сил после долгого напряжения.",
  focus: "Обратите внимание на то, что сегодня даёт опору.",
  question: "Что сегодня меня восстанавливает?",
  miniAppUrl: "https://app.example.com/miniapp?entry=daily_card",
  photoUrl: "https://example.com/api/cards/day/major-17-up",
};

describe("B678 · сообщение карты дня", () => {
  it("несёт карту, положение, трактовку и призыв в мини-апп", () => {
    const text = formatTelegramMessage("DAILY_CARD", "Аня", TAROT_DATA);
    expect(text).toContain("Звезда");
    expect(text).toContain("Тихое восстановление");
    expect(text).toContain(TAROT_DATA.body);
    expect(text).toContain(TAROT_DATA.focus);
    expect(text).toContain(TAROT_DATA.question);
    expect(text).toContain(TAROT_DATA.miniAppUrl);
  });

  it("называет перевёрнутое положение словами", () => {
    const text = formatTelegramMessage("DAILY_CARD", "Аня", { ...TAROT_DATA, reversed: "1" });
    expect(text).toContain("перевёрнутая");
  });

  it("старый вид события (практика дня) продолжает работать", () => {
    // У «Ежедневной практики» нет `cardName`. Разъехавшаяся ветка отдала бы
    // здесь пустую строку — и человек получил бы сообщение ни о чём.
    const text = formatTelegramMessage("DAILY_CARD", "Аня", {
      title: "Пауза перед ответом",
      body: "Не каждый импульс требует немедленного действия.",
    });
    expect(text).toContain("Пауза перед ответом");
    expect(text).toContain("Открыть кабинет");
    expect(text).not.toContain("Карта дня ·");
  });

  it("подпись под картинкой укладывается в предел Telegram", () => {
    // У `sendPhoto` подпись ограничена 1024 символами против 4096 у сообщения.
    const text = formatTelegramMessage("DAILY_CARD", "Аня", TAROT_DATA);
    expect(text.length).toBeLessThanOrEqual(1024);
  });
});

describe("B678 · ключ доставки", () => {
  it("начинается с суток, поэтому сводка считает день запросом по префиксу", () => {
    const key = tarotDayDeliveryKey("2026-08-05", "user-1");
    expect(key.startsWith(tarotDayDeliveryPrefix("2026-08-05"))).toBe(true);
    expect(key).toBe("tarot-day:2026-08-05:user-1:TELEGRAM");
    // Ключ следующих суток НЕ попадает в выборку сегодняшних.
    expect(tarotDayDeliveryKey("2026-08-06", "user-1").startsWith(tarotDayDeliveryPrefix("2026-08-05"))).toBe(false);
  });

  it("у одного человека за одни сутки ключ ровно один", () => {
    expect(tarotDayDeliveryKey("2026-08-05", "user-1")).toBe(tarotDayDeliveryKey("2026-08-05", "user-1"));
    expect(tarotDayDeliveryKey("2026-08-05", "user-1")).not.toBe(tarotDayDeliveryKey("2026-08-05", "user-2"));
  });
});
