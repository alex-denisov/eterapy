/**
 * B654 — Reddit ждёт человека, а не притворяется утверждённым к выпуску.
 *
 * Решение владельца 2026-08-06: ожидание API-приложения снято, рельс Reddit —
 * ручная публикация. Пока утверждённый материал вставал в `SCHEDULED`, он
 * попадал в дорогу автовыпуска, которой у площадки нет: коннектор отвечал «не
 * настроен», площадка уходила в `publish-hold`, сторож просроченного
 * `SCHEDULED` каждые полчаса произносил «публикации не появляются», а строка
 * при этом держала слот контент-плана, ни разу не выйдя.
 *
 * Граница прогона: ручная площадка получает своё состояние, автоматические не
 * тронуты, и `MANUAL` не попадает ни в выборку выпуска, ни в сторож.
 */

import {
  approvedStatusForPlatform,
  MARKETING_MANUAL_STATUS,
  marketingPlatformNeedsManualPublishing,
} from "@/lib/marketing/manual-platforms";

describe("B654 · состояние «ждёт ручной публикации»", () => {
  it("Reddit — площадка без автоматического выпуска", () => {
    expect(marketingPlatformNeedsManualPublishing("reddit")).toBe(true);
    expect(marketingPlatformNeedsManualPublishing("Reddit")).toBe(true);
    expect(marketingPlatformNeedsManualPublishing("REDDIT")).toBe(true);
  });

  it("площадки с рабочим выпуском остаются автоматическими", () => {
    for (const platform of ["vk", "telegram", "dzen", "threads", "instagram"]) {
      expect(marketingPlatformNeedsManualPublishing(platform)).toBe(false);
      expect(approvedStatusForPlatform(platform)).toBe("SCHEDULED");
    }
  });

  it("утверждённый материал Reddit встаёт в MANUAL, а не в SCHEDULED", () => {
    expect(approvedStatusForPlatform("reddit")).toBe(MARKETING_MANUAL_STATUS);
    expect(approvedStatusForPlatform("reddit")).not.toBe("SCHEDULED");
  });

  it("MANUAL — отдельное состояние, а не переименованная пауза или отказ", () => {
    expect(["PAUSED", "FAILED", "ARCHIVED", "SCHEDULED"]).not.toContain(MARKETING_MANUAL_STATUS);
  });
});
