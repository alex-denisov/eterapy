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
 */
describe("B554 — источник расписания в мини-аппе", () => {
  const screens = read("components/miniapp/journey-screens.tsx");

  it("экран записи берёт слоты из того же источника, что и веб", () => {
    expect(screens).toContain("/api/slots/month?practitionerId=");
    expect(screens).toContain("/api/slots/available?practitionerId=");
  });

  it("не ходит за расписанием в эндпоинт разовых слотов", () => {
    // `/api/slots?` — именно список персональных строк. Он остаётся в API, но
    // экран записи на него опираться не должен.
    expect(screens).not.toContain("`/api/slots?practitionerId=");
  });

  it("выбор слота не завязан на id — у сгенерированных слотов его нет", () => {
    // Сгенерированные по правилу слоты приходят без `id`; сравнение
    // `(item.id ?? item.slotId) === selected` давало undefined === string и
    // кнопка «Проверить запись» не разблокировалась бы никогда.
    expect(screens).toContain("item.id ?? item.slotId ?? item.startAt");
  });

  it("дни запрашиваются параллельно, а не по очереди", () => {
    // Последовательно это девять round-trip'ов подряд — на мобильной сети
    // экран несколько секунд висит в «Проверяем расписание…».
    expect(screens).toContain("Promise.all(soonest.map");
  });
});
