/**
 * B654 — площадка без автоматического выпуска ждёт человека, а не
 * притворяется утверждённой к выпуску.
 *
 * Пока утверждённый материал такой площадки вставал в `SCHEDULED`, он попадал
 * в дорогу автовыпуска, которой у неё нет: коннектор отвечал «не настроен»,
 * площадка уходила в `publish-hold`, сторож просроченного `SCHEDULED` каждые
 * полчаса произносил «публикации не появляются», а строка при этом держала
 * слот контент-плана, ни разу не выйдя.
 *
 * ⚠ B742 — СПИСОК РУЧНЫХ ПЛОЩАДОК ПУСТ. Ручной была одна, Reddit, и решением
 * владельца 2026-09-12 она убрана из контура целиком. Прогон сторожит
 * оставшееся: у каждой живой площадки есть автоматическая дорога, `MANUAL`
 * по-прежнему отдельное состояние (в реестре прода лежат строки, заведённые
 * до удаления), и ни одна площадка не получает его молча.
 */

import {
  approvedStatusForPlatform,
  MARKETING_MANUAL_PLATFORMS,
  MARKETING_MANUAL_STATUS,
  marketingPlatformNeedsManualPublishing,
} from "@/lib/marketing/manual-platforms";

describe("B654 · состояние «ждёт ручной публикации»", () => {
  it("у каждой живой площадки есть автоматический выпуск", () => {
    for (const platform of ["vk", "telegram", "dzen", "threads", "instagram", "max"]) {
      expect(marketingPlatformNeedsManualPublishing(platform)).toBe(false);
      expect(approvedStatusForPlatform(platform)).toBe("SCHEDULED");
    }
  });

  it("B742: ручных площадок не осталось — MANUAL никому не выдаётся молча", () => {
    expect([...MARKETING_MANUAL_PLATFORMS]).toEqual([]);
    // Reddit убран из контура: спрашивать про него больше некому, но и
    // унаследовать его состояние новая площадка не может.
    expect(marketingPlatformNeedsManualPublishing("reddit")).toBe(false);
    expect(approvedStatusForPlatform("reddit")).toBe("SCHEDULED");
  });

  it("MANUAL — отдельное состояние, а не переименованная пауза или отказ", () => {
    expect(["PAUSED", "FAILED", "ARCHIVED", "SCHEDULED"]).not.toContain(MARKETING_MANUAL_STATUS);
  });
});
