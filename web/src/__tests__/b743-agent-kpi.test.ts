/**
 * B743 — KPI агентов: месяц, квартал, год.
 *
 * Владелец 2026-09-13: «Их ключевые метрики (KPI) должны быть зафиксированы и
 * по ним они должны отчитываться, это должно подстёгивать их к выполнению
 * своей работы более успешно каждый раз».
 *
 * Прогон сторожит три вещи, каждая из которых уже ломалась в этом проекте:
 * метрика без замера не выдаётся за ноль; ограничитель сильнее основной
 * метрики; разрыв превращается в правку с числом, а не в абзац.
 */

import {
  AGENT_KPIS,
  judgeKpi,
  kpiPressure,
  kpisFor,
  periodBounds,
  type KpiPeriod,
  type KpiVerdict,
} from "@/lib/marketing/kpi";
import { kpiBlock } from "@/lib/marketing/orchestrator-report";

const PERIODS: KpiPeriod[] = ["month", "quarter", "year"];

function verdict(id: string, actual: number | null, period: KpiPeriod = "month"): KpiVerdict {
  const definition = AGENT_KPIS.find((kpi) => kpi.id === id)!;
  return judgeKpi({ definition, actual, period });
}

describe("B743 — метрики объявлены целиком и защитимо", () => {
  it("у каждого агента есть метрики, и у каждой — источник и основание", () => {
    for (const agent of ["seo", "smm", "orchestrator"] as const) {
      expect(kpisFor(agent).length).toBeGreaterThanOrEqual(3);
    }
    for (const kpi of AGENT_KPIS) {
      // Метрика без источника — это обещание завести замер, а не цель.
      expect(kpi.source.length).toBeGreaterThan(20);
      expect(kpi.why.length).toBeGreaterThan(40);
      expect(kpi.baseline.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("у каждой метрики есть цель на месяц, квартал и год", () => {
    for (const kpi of AGENT_KPIS) {
      for (const period of PERIODS) {
        expect(typeof kpi.targets[period]).toBe("number");
      }
    }
  });

  it("цели растут по горизонту, а не скачут", () => {
    for (const kpi of AGENT_KPIS) {
      const { month, quarter, year } = kpi.targets;
      if (kpi.direction === "up") {
        expect(quarter).toBeGreaterThanOrEqual(month);
        expect(year).toBeGreaterThanOrEqual(quarter);
      } else {
        expect(quarter).toBeLessThanOrEqual(month);
        expect(year).toBeLessThanOrEqual(quarter);
      }
    }
  });

  it("у каждого агента есть ОГРАНИЧИТЕЛЬ, а не только метрика роста", () => {
    /**
     * Без ограничителя KPI «больше страниц» выполняется выпуском мусора, и это
     * не гипотеза: корпус из 199 карточек с медианой 65 собственных слов
     * набрался ровно так.
     */
    for (const agent of ["seo", "smm", "orchestrator"] as const) {
      const own = kpisFor(agent);
      expect(own.some((kpi) => kpi.why.includes("ОГРАНИЧИТЕЛЬ"))).toBe(true);
    }
  });

  it("метрик мало намеренно: двадцать метрик это ноль метрик", () => {
    expect(AGENT_KPIS.length).toBeLessThanOrEqual(12);
  });
});

describe("B743 — суждение не путает ноль с отсутствием замера", () => {
  it("без замера метрика не засчитывается ни в какую сторону", () => {
    const blind = verdict("seo.impressions", null);
    expect(blind.attainment).toBeNull();
    expect(blind.onTrack).toBe(false);
  });

  it("метрика «вниз» выполнена, когда факт не больше цели", () => {
    // Одна формула на оба направления однажды показала бы рост расхода ростом.
    const good = verdict("smm.sameness_rate", 30);
    const bad = verdict("smm.sameness_rate", 70);
    expect(good.onTrack).toBe(true);
    expect(bad.onTrack).toBe(false);
    expect(good.attainment!).toBeGreaterThan(bad.attainment!);
  });

  it("метрика «вверх» выполнена, когда факт не меньше цели", () => {
    expect(verdict("seo.indexable_share", 25).onTrack).toBe(true);
    expect(verdict("seo.indexable_share", 14).onTrack).toBe(false);
  });

  it("ноль по метрике «вниз» — это выполнение, а не деление на ноль", () => {
    expect(verdict("smm.sameness_rate", 0).attainment).toBe(1);
  });
});

describe("B743 — разрыв превращается в правку, а не в абзац", () => {
  it("отставание по глубине корпуса поднимает норму выпуска", () => {
    const moves = kpiPressure({
      verdicts: [verdict("seo.indexable_share", 14), verdict("seo.unique_share", 90)],
      seoPagesPerDay: 2,
    });
    expect(moves).toEqual([expect.objectContaining({ setting: "seo.pages_per_day", value: 3 })]);
    // У правки обязана быть причина числом: «поднял темп» без числа — это не
    // отчёт, а сообщение о деятельности.
    expect(moves[0].because).toContain("14");
  });

  it("ОГРАНИЧИТЕЛЬ сильнее: при просевшем качестве темп не растёт, а падает", () => {
    const moves = kpiPressure({
      verdicts: [verdict("seo.indexable_share", 14), verdict("seo.unique_share", 40)],
      seoPagesPerDay: 3,
    });
    expect(moves.some((move) => move.value > 3)).toBe(false);
    expect(moves).toContainEqual(expect.objectContaining({ setting: "seo.pages_per_day", value: 2 }));
  });

  it("всё в норме — правок нет: «изменил на то же самое» это шум", () => {
    expect(kpiPressure({
      verdicts: [verdict("seo.indexable_share", 30), verdict("seo.unique_share", 90)],
      seoPagesPerDay: 2,
    })).toEqual([]);
  });

  it("без замера разрыва нет: неизмеренная метрика ничего не двигает", () => {
    expect(kpiPressure({
      verdicts: [verdict("seo.indexable_share", null), verdict("seo.unique_share", null)],
      seoPagesPerDay: 2,
    })).toEqual([]);
  });

  it("норма не уходит за объявленные границы белого списка", () => {
    const up = kpiPressure({
      verdicts: [verdict("seo.indexable_share", 1), verdict("seo.unique_share", 95)],
      seoPagesPerDay: 8,
    });
    expect(up.every((move) => move.value <= 8)).toBe(true);
    const down = kpiPressure({
      verdicts: [verdict("seo.unique_share", 10)],
      seoPagesPerDay: 1,
    });
    expect(down.every((move) => move.value >= 1)).toBe(true);
  });
});

describe("B743 — KPI в отчёте владельцу", () => {
  it("показывает план, факт и отметку выполнения", () => {
    const text = kpiBlock([verdict("seo.indexable_share", 14), verdict("smm.slot_fill", 85)], "month").join("\n");
    expect(text).toContain("KPI за месяц");
    expect(text).toContain("SEO-агент");
    expect(text).toContain("при цели");
    expect(text).toContain("🔴");
    expect(text).toContain("🟢");
  });

  it("неизмеренное названо долгом, а не показано нулём", () => {
    const text = kpiBlock([verdict("smm.cost_per_material", null)], "month").join("\n");
    expect(text).toContain("Без замера");
    expect(text).not.toContain("🔴");
  });

  it("пустой набор блока не создаёт", () => {
    expect(kpiBlock([], "month")).toEqual([]);
  });
});

describe("B743 — границы периодов считаются по Москве", () => {
  it("месяц начинается московской полуночью первого числа", () => {
    const { start } = periodBounds("month", new Date("2026-09-13T06:00:00Z"));
    expect(start.toISOString()).toBe("2026-08-31T21:00:00.000Z");
  });

  it("квартал начинается с первого месяца своей тройки", () => {
    const { start } = periodBounds("quarter", new Date("2026-09-13T06:00:00Z"));
    expect(start.toISOString()).toBe("2026-06-30T21:00:00.000Z");
  });

  it("год начинается первым января по Москве", () => {
    const { start } = periodBounds("year", new Date("2026-09-13T06:00:00Z"));
    expect(start.toISOString()).toBe("2025-12-31T21:00:00.000Z");
  });
});
