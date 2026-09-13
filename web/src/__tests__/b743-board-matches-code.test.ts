/**
 * B743 — контракт KPI, напечатанный из кода, и доска задач владельца.
 *
 * ⚠ ПРОГОН НЕ ЧИТАЕТ `docs/`, И ЭТО НЕ ЛЕНЬ. Решением B340 публичный
 * репозиторий держит только продукт: документация и агентские контракты живут
 * на машине владельца и не коммитятся. Прогон, читающий `docs/board/kpi.md`,
 * был бы зелёным здесь и красным в чистом клоне — то есть проверял бы наличие
 * файла у себя, а не правильность кода.
 *
 * Поэтому проверяется РЕНДЕР: то самое содержимое, которое скрипт кладёт в
 * файл. Первая редакция таблицы собиралась разбором исходника регуляркой и
 * молча перепутала строки — у «показов в поиске» оказались цели от
 * «уникальности». Таблица выглядела правдоподобно и была неверна, а это худший
 * вид документации: по ней принимают решения.
 */

import { AGENT_KPIS } from "@/lib/marketing/kpi";
import { renderKpiTable } from "@/lib/marketing/kpi-doc";

const table = renderKpiTable();

describe("B743 — таблица KPI печатается из реестра, а не пересказывается", () => {
  it("каждая метрика стоит в одной строке со СВОИМИ целями и базой", () => {
    for (const kpi of AGENT_KPIS) {
      const row = table.split("\n").find((line) => line.startsWith(`| ${kpi.title} |`));
      expect(row).toBeDefined();
      // Ровно то, на чём сломалась первая редакция: строка метрики получила
      // чужие числа, и заметить это можно было только руками.
      expect(row).toContain(`| ${kpi.targets.month} | ${kpi.targets.quarter} | ${kpi.targets.year} |`);
      expect(row).toContain(`${kpi.baseline.value} (${kpi.baseline.measuredAt})`);
    }
  });

  it("у каждой метрики напечатаны основание и источник замера", () => {
    for (const kpi of AGENT_KPIS) {
      expect(table).toContain(kpi.why);
      expect(table).toContain(kpi.source);
    }
  });

  it("направление видно: без него «вниз» читается как провал", () => {
    for (const kpi of AGENT_KPIS.filter((item) => item.direction === "down")) {
      const row = table.split("\n").find((line) => line.startsWith(`| ${kpi.title} |`))!;
      expect(row).toContain("↓");
    }
  });

  it("таблица помечена сгенерированной: правка руками разойдётся с кодом", () => {
    expect(table).toContain("npm run kpi:table");
    expect(table).toContain("Руками не правьте");
  });

  it("оба правила, без которых числа ничего не значат, напечатаны рядом с ними", () => {
    expect(table).toContain("ограничитель");
    expect(table).toContain("Разрыв меняет условия работы");
    // Долг назван честно: метрика без замера не выдаётся за ноль.
    expect(table).toContain("не измерили");
  });
});
