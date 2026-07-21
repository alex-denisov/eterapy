import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8");

/**
 * B554 (owner 2026-07-21): «запись к практику мертва».
 *
 * Диагноз прошлой сессии — «0 будущих строк в time_slots» — был неполным.
 * Расписание у ВСЕХ специалистов задано недельными правилами (schedule_rules),
 * из которых слоты генерируются на лету; разовых строк в time_slots на проде
 * нет ни у кого. Веб именно так и читает (`/api/slots/month` +
 * `/api/slots/available`) и показывает время, а мини-апп ходил в `/api/slots`,
 * который отдаёт ТОЛЬКО разовые строки, — и всегда рисовал «Свободное время
 * уточняется». Записаться было нельзя ровно в мини-аппе.
 *
 * B557 перенёс экран записи в `components/miniapp/booking-screen.tsx` и заменил
 * плоский список слотов на календарь. Инварианты источника данных остаются —
 * проверяем их по новому файлу. Требование «дни запрашиваются параллельно»
 * снято вместе с самой пачкой запросов: календарь грузит слоты ОДНОГО
 * выбранного дня, поэтому параллелить нечего.
 */
describe("B554/B557 — источник расписания в мини-аппе", () => {
  const screen = read("components/miniapp/booking-screen.tsx");

  it("экран записи берёт слоты из того же источника, что и веб", () => {
    expect(screen).toContain("/api/slots/month?practitionerId=");
    expect(screen).toContain("/api/slots/available?practitionerId=");
  });

  it("не ходит за расписанием в эндпоинт разовых слотов", () => {
    // `/api/slots?` — именно список персональных строк. Он остаётся в API, но
    // экран записи на него опираться не должен.
    expect(screen).not.toContain("`/api/slots?practitionerId=");
  });

  it("выбор слота не завязан на id — у сгенерированных слотов его нет", () => {
    // Сгенерированные по правилу слоты приходят без `id`; сравнение
    // `(item.id ?? item.slotId) === selected` давало undefined === string и
    // кнопка подтверждения не разблокировалась бы никогда.
    expect(screen).toContain("item.id ?? item.slotId ?? item.startAt");
  });

  it("за расписанием ходит только экран записи, а не журнальный модуль", () => {
    expect(read("components/miniapp/journey-screens.tsx")).not.toContain("/api/slots");
  });
});
