/**
 * B740 — прогон оркестратора.
 *
 * Проверяется то, ради чего он и заведён: диагноз воспроизводим, отчёт
 * существует без модели, границы правок нельзя перешагнуть, а спокойный проход
 * не превращается в поток сообщений, в котором тонет инцидент.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { diagnose, directivesFrom } from "@/lib/marketing/orchestrator-diagnosis";
import {
  buildOrchestratorReport,
  directivesBlock,
  findingsBlock,
} from "@/lib/marketing/orchestrator-report";
import { shouldReport } from "@/lib/marketing/orchestrator";
import {
  EDITABLE_PROMPT_FEATURES,
  SETTING_BOUNDS,
  applyDirective,
  describeDirective,
  type OrchestratorDirective,
} from "@/lib/marketing/orchestrator-actions";
import type { OrchestratorState } from "@/lib/marketing/orchestrator-state";

const NOW = new Date("2026-09-12T09:00:00Z");

function stateWith(overrides: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    now: NOW,
    conveyor: {
      demand: 4,
      buffer: 6,
      ready: 5,
      awaitingReview: 2,
      maxAwaitingReview: 6,
      writtenThisHour: 1,
      deferred: 3,
      perHour: 2,
      writerBudget: 1,
      capacityPerHour: 2,
      materialsLeftToday: 10,
      canSeparateRoles: true,
      bottleneck: "buffer",
      pausedUntil: null,
      idleReason: "Линия работает",
    },
    providers: [
      { provider: "GEMINI", enabled: true, lastSuccessAt: new Date(NOW.getTime() - 60_000), lastErrorAt: null, lastErrorCode: null },
      { provider: "MISTRAL", enabled: true, lastSuccessAt: new Date(NOW.getTime() - 120_000), lastErrorAt: null, lastErrorCode: null },
      { provider: "GROQ", enabled: true, lastSuccessAt: new Date(NOW.getTime() - 300_000), lastErrorAt: null, lastErrorCode: null },
    ],
    platforms: [{ platform: "telegram", published: 3, stalled: 0, topReason: null }],
    signals: [],
    seo: {
      publishedToday: 2,
      publishedWeek: 9,
      dailyCap: 4,
      queueNew: 12,
      queueRejected: 30,
      neverSubmitted: 0,
      lastPublishedAt: new Date(NOW.getTime() - 60 * 60_000),
    },
    search: {
      impressions: 120,
      clicks: 7,
      averagePosition: 18.4,
      searchablePages: 43,
      previousImpressions: 110,
    },
    stalledIds: [],
    ...overrides,
  };
}

describe("B740 — диагноз ставится кодом и воспроизводим", () => {
  it("здоровый контур не выдумывает проблем", () => {
    expect(diagnose(stateWith())).toEqual([]);
  });

  it("один и тот же снимок даёт один и тот же диагноз", () => {
    const state = stateWith({ stalledIds: ["a", "b", "c", "d"] });
    expect(diagnose(state)).toEqual(diagnose(state));
  });

  it("молчащий провайдер выводится из пула, и правка обратима", () => {
    const state = stateWith({
      providers: [
        { provider: "GEMINI", enabled: true, lastSuccessAt: new Date(NOW.getTime() - 48 * 3_600_000), lastErrorAt: NOW, lastErrorCode: "HTTP_429" },
        { provider: "MISTRAL", enabled: true, lastSuccessAt: new Date(NOW.getTime() - 60_000), lastErrorAt: null, lastErrorCode: null },
        { provider: "GROQ", enabled: true, lastSuccessAt: new Date(NOW.getTime() - 60_000), lastErrorAt: null, lastErrorCode: null },
      ],
    });
    const directives = directivesFrom(diagnose(state));
    const disable = directives.find((directive) => directive.action === "toggle_provider");
    expect(disable?.payload).toEqual({ provider: "GEMINI", enabled: false });
    expect(disable?.risk).toBe("reversible");
  });

  it("пустой пул — это инцидент, который настройкой не чинится", () => {
    const state = stateWith({ providers: [] });
    const findings = diagnose(state);
    const exhausted = findings.find((finding) => finding.code === "pool.exhausted");
    expect(exhausted?.severity).toBe("incident");
    // Находка без правки допустима: нового ключа оркестратор себе не выпишет.
    expect(exhausted?.directive).toBeUndefined();
  });

  it("вставшие материалы возвращаются в работу порциями, а не залпом", () => {
    const state = stateWith({ stalledIds: Array.from({ length: 20 }, (_, i) => `id-${i}`) });
    const requeue = directivesFrom(diagnose(state))
      .find((directive) => directive.action === "requeue_publications");
    expect((requeue?.payload.ids as string[]).length).toBe(5);
  });

  it("падение показов на 40 % — инцидент, а не колебание выдачи", () => {
    const state = stateWith({
      search: { impressions: 40, clicks: 1, averagePosition: 30, searchablePages: 43, previousImpressions: 200 },
    });
    expect(diagnose(state).some((finding) => finding.code === "search.impressions_drop")).toBe(true);
  });

  it("остановившийся SEO-агент виден, и причина различает сбор от выпуска", () => {
    const stalledWithQueue = diagnose(stateWith({
      seo: { ...stateWith().seo, lastPublishedAt: new Date(NOW.getTime() - 72 * 3_600_000), queueNew: 40 },
    })).find((finding) => finding.code === "seo.stalled");
    expect(stalledWithQueue?.detail).toContain("останавливается не сбор");

    const stalledEmpty = diagnose(stateWith({
      seo: { ...stateWith().seo, lastPublishedAt: null, queueNew: 0 },
    })).find((finding) => finding.code === "seo.stalled");
    expect(stalledEmpty?.detail).toContain("Очередь запросов пуста");
  });
});

describe("B740 — отчёт существует и без модели", () => {
  it("текст собирается при недоступном пуле", () => {
    const state = stateWith({ stalledIds: ["a", "b", "c"] });
    const findings = diagnose(state);
    const report = buildOrchestratorReport({
      state,
      findings,
      directives: directivesFrom(findings),
      narrative: null,
    });
    expect(report).toContain("Отчёт оркестратора");
    expect(report).toContain("Как сейчас");
    expect(report).toContain("Что я нашёл");
  });

  it("сначала проблема, потом правка — руководитель читает состояние дел", () => {
    const state = stateWith({ stalledIds: ["a", "b", "c"] });
    const findings = diagnose(state);
    const report = buildOrchestratorReport({
      state,
      findings,
      directives: directivesFrom(findings),
      narrative: null,
    });
    expect(report.indexOf("Что я нашёл")).toBeLessThan(report.indexOf("Что меняю"));
  });

  it("у каждой правки в отчёте названо обоснование", () => {
    const directives = directivesFrom(diagnose(stateWith({ stalledIds: ["a", "b", "c"] })));
    const block = directivesBlock(directives).join("\n");
    for (const directive of directives) {
      expect(block).toContain(directive.rationale);
    }
  });

  it("пустой диагноз не притворяется отчётом о проблемах", () => {
    expect(findingsBlock([]).join("\n")).toContain("Проблем не нашёл");
  });
});

describe("B740 — спокойный проход молчит, но раз в сутки отчитывается", () => {
  it("находок нет и доклад был недавно — молчим", () => {
    expect(shouldReport({
      findings: 0,
      directives: 0,
      now: NOW,
      lastReportAt: new Date(NOW.getTime() - 6 * 3_600_000),
    }).report).toBe(false);
  });

  it("находок нет, но сутки прошли — отчитываемся: владелец должен отличать тишину от смерти агента", () => {
    expect(shouldReport({
      findings: 0,
      directives: 0,
      now: NOW,
      lastReportAt: new Date(NOW.getTime() - 25 * 3_600_000),
    }).report).toBe(true);
  });

  it("есть находка — отчитываемся немедленно", () => {
    expect(shouldReport({
      findings: 1,
      directives: 0,
      now: NOW,
      lastReportAt: new Date(NOW.getTime() - 60_000),
    }).report).toBe(true);
  });
});

describe("B740 — границы автономии не перешагиваются", () => {
  const base: OrchestratorDirective = {
    key: "test",
    target: "seo",
    action: "set_setting",
    payload: { key: "seo.pages_per_day", value: 5 },
    problem: "p",
    rationale: "r",
    risk: "reversible",
  };

  it("настройка вне белого списка не применяется", async () => {
    const outcome = await applyDirective({
      ...base,
      payload: { key: "payments.commission_percent", value: 1 },
    });
    expect(outcome.applied).toBe(false);
    expect(outcome.error).toContain("вне белого списка");
  });

  it("значение вне границ не применяется", async () => {
    const outcome = await applyDirective({ ...base, payload: { key: "seo.pages_per_day", value: 200 } });
    expect(outcome.applied).toBe(false);
    expect(outcome.error).toContain("вне границ");
  });

  it("правка рода «деньги» только докладывается", async () => {
    const outcome = await applyDirective({ ...base, risk: "monetary" });
    expect(outcome.applied).toBe(false);
    expect(outcome.error).toContain("только докладывается");
  });

  it("несуществующий провайдер не применяется", async () => {
    const outcome = await applyDirective({
      ...base,
      action: "toggle_provider",
      payload: { provider: "НЕТ_ТАКОГО", enabled: false },
    });
    expect(outcome.applied).toBe(false);
    expect(outcome.error).toContain("не существует");
  });

  it("промт живого клиента оркестратору не подчиняется", async () => {
    const outcome = await applyDirective({
      ...base,
      action: "update_prompt",
      payload: { feature: "dialogue-primary-answer", promptText: "x".repeat(500) },
    });
    expect(outcome.applied).toBe(false);
    expect(EDITABLE_PROMPT_FEATURES.has("dialogue-primary-answer")).toBe(false);
  });

  /**
   * ⚠ САМАЯ ВАЖНАЯ ПРОВЕРКА ЭТОГО ФАЙЛА.
   *
   * Настройка в белом списке, которую никто не читает в рантайме, — худший из
   * возможных исходов: правка применяется, строка в базе меняется, отчёт
   * владельцу утверждает «потолок поднят», а поведение остаётся прежним.
   * Отличить это от работающего механизма по симптомам нельзя.
   *
   * Оба ключа получили своих читателей в B740 — до него `seo.pages_per_day`
   * и `marketing.conveyor.max_awaiting_review` жили только в `process.env`,
   * прочитанном на старте процесса.
   */
  it("у каждой настройки белого списка есть читатель в рантайме", () => {
    const readers: Record<string, string> = {
      "seo.pages_per_day": "src/lib/seo/page-agent.ts",
      "marketing.conveyor.max_awaiting_review": "src/lib/marketing/conveyor-settings.ts",
    };
    for (const key of Object.keys(SETTING_BOUNDS)) {
      const reader = readers[key];
      expect({ key, hasReader: Boolean(reader) }).toEqual({ key, hasReader: true });
      const source = readFileSync(join(process.cwd(), reader), "utf8");
      expect(source).toContain(key);
      // Читатель обязан ходить в базу, а не просто упоминать ключ в комментарии.
      expect(source).toContain("platformSetting");
    }
  });

  it("у каждой числовой настройки есть пол и потолок", () => {
    for (const [key, bounds] of Object.entries(SETTING_BOUNDS)) {
      expect({ key, ok: bounds.min < bounds.max && bounds.min > 0 }).toEqual({ key, ok: true });
    }
  });

  it("каждое действие словаря описывается человеку словами", () => {
    expect(describeDirective(base)).toContain("страниц Библиотеки в сутки");
    expect(describeDirective({ ...base, action: "toggle_platform", payload: { platform: "vk", enabled: false } }))
      .toContain("выключить площадку vk");
  });
});
