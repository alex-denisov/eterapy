/**
 * B750 — суточная презентация оркестратора и ритм отчётности.
 *
 * Владелец 2026-10-04: «Отчеты писать каждые 6 часов не надо … раз в сутки
 * будет ОК. Нужна чёткая, лаконичная отчётность … как презентация для
 * руководителя». Проверяется ритм (чистая функция), длина и порядок секций.
 */

import {
  BRIEF_HARD_CAP,
  INCIDENT_DEDUPE_MS,
  buildDailyBrief,
  buildIncidentAlert,
  reportDecision,
  type BriefDirective,
} from "@/lib/marketing/orchestrator-brief";
import type { OrchestratorFinding } from "@/lib/marketing/orchestrator-diagnosis";
import type { OrchestratorState } from "@/lib/marketing/orchestrator-state";

// 05:59 UTC = 08:59 МСК, 06:00 UTC = 09:00 МСК.
const AT_0859 = new Date("2026-10-05T05:59:00Z");
const AT_0900 = new Date("2026-10-05T06:00:00Z");
const YESTERDAY_BRIEF = new Date("2026-10-04T06:01:00Z");
const TODAY_BRIEF = new Date("2026-10-05T06:02:00Z");

const base = { reportNow: false, incidents: [] as string[], lastIncidentAt: {} };

describe("B750 — reportDecision: ритм", () => {
  it("08:59 МСК — суточный отчёт ещё не наступил", () => {
    const d = reportDecision({ ...base, now: AT_0859, lastBriefAt: YESTERDAY_BRIEF });
    expect(d.daily).toBe(false);
    expect(d.alertCodes).toEqual([]);
  });

  it("09:00 МСК — первый проход после рубежа отчитывается", () => {
    expect(reportDecision({ ...base, now: AT_0900, lastBriefAt: YESTERDAY_BRIEF }).daily).toBe(true);
  });

  it("презентации ещё не было никогда — отчитываемся после 09:00", () => {
    expect(reportDecision({ ...base, now: AT_0900, lastBriefAt: null }).daily).toBe(true);
  });

  it("сегодняшняя презентация доставлена — второй за сутки нет", () => {
    const later = new Date("2026-10-05T12:00:00Z");
    expect(reportDecision({ ...base, now: later, lastBriefAt: TODAY_BRIEF }).daily).toBe(false);
  });

  it("после 09:00, но презентация вчерашняя — отчитываемся и в 18:00", () => {
    const evening = new Date("2026-10-05T15:00:00Z");
    expect(reportDecision({ ...base, now: evening, lastBriefAt: YESTERDAY_BRIEF }).daily).toBe(true);
  });

  it("рубеж считается по Москве, а не по UTC: 00:30 МСК — ещё вчерашние сутки", () => {
    const midnight = new Date("2026-10-04T21:30:00Z");
    expect(reportDecision({ ...base, now: midnight, lastBriefAt: YESTERDAY_BRIEF }).daily).toBe(false);
  });

  it("report_now — отчёт вне расписания, даже если сегодняшний уже ушёл", () => {
    const d = reportDecision({ ...base, now: AT_0859, lastBriefAt: TODAY_BRIEF, reportNow: true });
    expect(d.ownerRequested).toBe(true);
    expect(d.daily).toBe(false);
  });
});

describe("B750 — reportDecision: инциденты", () => {
  it("новый инцидент уходит сразу, не дожидаясь 09:00", () => {
    const d = reportDecision({ ...base, now: AT_0859, lastBriefAt: YESTERDAY_BRIEF, incidents: ["pool.dead"] });
    expect(d.alertCodes).toEqual(["pool.dead"]);
  });

  it("тот же код в течение 12 ч не повторяется", () => {
    const d = reportDecision({
      ...base,
      now: AT_0900,
      lastBriefAt: TODAY_BRIEF,
      incidents: ["pool.dead"],
      lastIncidentAt: { "pool.dead": new Date(AT_0900.getTime() - INCIDENT_DEDUPE_MS + 60_000) },
    });
    expect(d.alertCodes).toEqual([]);
  });

  it("через 12 ч тот же код — снова", () => {
    const d = reportDecision({
      ...base,
      now: AT_0900,
      lastBriefAt: TODAY_BRIEF,
      incidents: ["pool.dead"],
      lastIncidentAt: { "pool.dead": new Date(AT_0900.getTime() - INCIDENT_DEDUPE_MS - 1) },
    });
    expect(d.alertCodes).toEqual(["pool.dead"]);
  });

  it("дедуп по коду: другой код не гасится чужим", () => {
    const d = reportDecision({
      ...base,
      now: AT_0900,
      lastBriefAt: TODAY_BRIEF,
      incidents: ["a", "b"],
      lastIncidentAt: { a: new Date(AT_0900.getTime() - 60_000) },
    });
    expect(d.alertCodes).toEqual(["b"]);
  });

  it("когда уходит презентация, отдельный алерт не нужен: инцидент в ней", () => {
    const d = reportDecision({ ...base, now: AT_0900, lastBriefAt: YESTERDAY_BRIEF, incidents: ["pool.dead"] });
    expect(d.daily).toBe(true);
    expect(d.alertCodes).toEqual([]);
  });
});

// ── Фикстуры ────────────────────────────────────────────────────────────────

function finding(over: Partial<OrchestratorFinding> & { code: string }): OrchestratorFinding {
  return { severity: "warning", title: `Находка ${over.code}`, detail: "Пояснение.", ...over };
}

function directive(key: string, over: Partial<BriefDirective> = {}): BriefDirective {
  return {
    key,
    target: "seo",
    action: "set_setting",
    payload: { key: "seo.pages_per_day", value: 6 },
    problem: "нехватка страниц",
    rationale: "Поднимаю норму выпуска: очередь запросов полна, а выпуск стоит на минимуме. Откатывается одной командой.",
    risk: "reversible",
    ...over,
  };
}

function stateFor(over: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    now: AT_0900,
    conveyor: {} as OrchestratorState["conveyor"],
    providers: [
      { provider: "GEMINI", enabled: true, lastSuccessAt: AT_0900, lastErrorAt: null, lastErrorCode: null },
      { provider: "GROQ", enabled: true, lastSuccessAt: null, lastErrorAt: AT_0900, lastErrorCode: "HTTP_429" },
    ],
    platforms: [
      { platform: "telegram", published: 3, stalled: 0, topReason: null },
      { platform: "vk", published: 2, stalled: 1, topReason: null },
    ],
    signals: [],
    seo: { publishedToday: 2, publishedWeek: 9, dailyCap: 4, queueNew: 12, queueRejected: 3, neverSubmitted: 0, lastPublishedAt: null },
    search: { impressions: 120, clicks: 7, averagePosition: 18.4, searchablePages: 43, previousImpressions: 110 },
    causes: [],
    stalledIds: [],
    feeds: [],
    lockedSlotIds: [],
    sources: {
      webmaster: { searchablePages: 80, excludedPages: 5, sitemapUrls: 90, recrawlRemaining: 20 },
      webmasterError: null,
      gsc: { totals: { clicks: 7, impressions: 120, ctr: 5.8, averagePosition: 18.4 }, queryCount: 23, topQueries: [] },
      gscError: null,
    },
    thinCards: 0,
    dzen: null,
    vertexConfigured: true,
    trend: {
      days: [],
      weeks: [
        { metric: "impressions", label: "Показы в поиске", current: 840, previous: 600, better: "up", unit: "" },
        { metric: "clicks", label: "Клики из поиска", current: 21, previous: 20, better: "up", unit: "" },
        { metric: "posts", label: "Постов вышло", current: 30, previous: 31, better: "up", unit: "" },
      ],
      diversity: [],
      duplicateDraftIds: [],
    },
    backlinks: [],
    recentDirectives: [],
    ...over,
  };
}

const SECTION_ORDER = ["ИТОГ", "ЧТО СДЕЛАЛ", "ЧТО ДЕЛАЮ ДАЛЬШЕ", "ЧТО НУЖНО ОТ ВАС"];

function bullets(text: string, from: string, to: string): string[] {
  const start = text.indexOf(from);
  const end = to ? text.indexOf(to) : text.length;
  return text.slice(start, end).split("\n").slice(1).filter((l) => l.trim() !== "");
}

describe("B750 — презентация: формат", () => {
  const many = Array.from({ length: 9 }, (_, i) =>
    finding({
      code: `f${i}`,
      title: `Длинная находка номер ${i}: контур стоит и не выпускает материалы уже много часов подряд`,
      detail: "Очень длинное пояснение ".repeat(20),
      ...(i === 0 ? { severity: "incident" as const } : {}),
      ...(i === 1 ? { ownerAction: { what: "Войти в Дзен через VNC", expected: "вернётся 4 поста в сутки" } } : {}),
    }));
  const applied = Array.from({ length: 5 }, (_, i) =>
    directive(`2026-10-04:applied${i}`, { rationale: "Длинное обоснование. ".repeat(30) }));
  const planned = Array.from({ length: 4 }, (_, i) => directive(`2026-10-05:plan${i}`));
  const notes = [
    { at: "2026-10-04T10:00:00Z", text: "самая старая заметка" },
    { at: "2026-10-04T11:00:00Z", text: "пауза" },
    { at: "2026-10-04T12:00:00Z", text: "профили готовы <b>" + "очень длинная заметка ".repeat(30) },
  ];
  const text = buildDailyBrief({
    state: stateFor(),
    findings: many,
    planned,
    applied,
    ownerNotes: notes,
    narrative: "Одно предложение от модели. ".repeat(40),
  });

  it("жёсткий потолок длины", () => {
    expect(text.length).toBeLessThanOrEqual(BRIEF_HARD_CAP);
    expect(BRIEF_HARD_CAP).toBeLessThanOrEqual(1800);
  });

  it("титул и секции идут в заданном порядке", () => {
    expect(text.startsWith("🧭 <b>Отчёт оркестратора · 05.10.2026</b>")).toBe(true);
    const positions = SECTION_ORDER.map((s) => text.indexOf(`<b>${s}</b>`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(text.indexOf("Ответьте сообщением в этом чате")).toBeGreaterThan(positions[3]);
  });

  it("лимиты: ИТОГ ≤3 строк, остальные секции ≤3 пунктов", () => {
    expect(bullets(text, "<b>ИТОГ</b>", "<b>ЧТО СДЕЛАЛ</b>").length).toBeLessThanOrEqual(3);
    expect(bullets(text, "<b>ЧТО СДЕЛАЛ</b>", "<b>ЧТО ДЕЛАЮ").length).toBeLessThanOrEqual(3);
    expect(bullets(text, "<b>ЧТО ДЕЛАЮ ДАЛЬШЕ</b>", "<b>ЧТО НУЖНО").length).toBeLessThanOrEqual(3);
  });

  it("мелкие находки не перечисляются, а сворачиваются в одну строку", () => {
    expect(text).toMatch(/\+\d+ мелких — в панели/);
    expect(text).not.toContain("Длинная находка номер 8");
  });

  it("заметка владельца учтена, HTML из неё экранирован", () => {
    expect(text).toContain("Учёл ваше:");
    expect(text).not.toContain("<b> очень");
    expect(text).toContain("&lt;b&gt;");
    expect(text).not.toContain("самая старая заметка");
  });

  it("шаг владельца из находки попадает в «что нужно от вас»", () => {
    expect(text).toContain("Войти в Дзен через VNC");
  });
});

describe("B750 — презентация: содержание", () => {
  it("вердикт берётся кодом из крупнейшего сдвига недели", () => {
    const text = buildDailyBrief({ state: stateFor(), findings: [], planned: [], applied: [], ownerNotes: [] });
    expect(text).toContain("лучше");
    expect(text).toContain("Показы в поиске");
    expect(text).toContain("+40 %");
  });

  it("ухудшение называется словом «хуже»", () => {
    const state = stateFor({
      trend: {
        days: [],
        weeks: [{ metric: "impressions", label: "Показы в поиске", current: 300, previous: 600, better: "up", unit: "" }],
        diversity: [],
        duplicateDraftIds: [],
      },
    });
    const text = buildDailyBrief({ state, findings: [], planned: [], applied: [], ownerNotes: [] });
    expect(text).toContain("хуже");
    expect(text).toContain("−50 %");
  });

  it("без изменений — когда все метрики равны", () => {
    const state = stateFor({
      trend: {
        days: [],
        weeks: [{ metric: "clicks", label: "Клики", current: 5, previous: 5, better: "up", unit: "" }],
        diversity: [],
        duplicateDraftIds: [],
      },
    });
    expect(buildDailyBrief({ state, findings: [], planned: [], applied: [], ownerNotes: [] })).toContain("без изменений");
  });

  it("молчащие Яндекс и Google названы, а не опущены", () => {
    const state = stateFor({
      sources: { webmaster: null, webmasterError: "HTTP 500", gsc: null, gscError: "timeout" },
    });
    const text = buildDailyBrief({ state, findings: [], planned: [], applied: [], ownerNotes: [] });
    expect(text).toContain("Яндекс/Google не ответили");
  });

  it("отвечает один источник — назван молчащий", () => {
    const state = stateFor({
      sources: { ...stateFor().sources, gsc: null, gscError: "timeout" },
    });
    const text = buildDailyBrief({ state, findings: [], planned: [], applied: [], ownerNotes: [] });
    expect(text).toContain("Google не ответил");
    expect(text).not.toContain("Яндекс/Google не ответили");
  });

  it("пустой раздел владельца — слово «ничего», а не пропуск", () => {
    const text = buildDailyBrief({ state: stateFor(), findings: [], planned: [], applied: [], ownerNotes: [] });
    expect(bullets(text, "<b>ЧТО НУЖНО ОТ ВАС</b>", "<i>Ответьте")).toEqual(["ничего"]);
  });

  it("запланированная правка идёт шагом с ожидаемым результатом и сроком проверки", () => {
    const text = buildDailyBrief({ state: stateFor(), findings: [], planned: [directive("k1")], applied: [], ownerNotes: [] });
    const steps = bullets(text, "<b>ЧТО ДЕЛАЮ ДАЛЬШЕ</b>", "<b>ЧТО НУЖНО");
    expect(steps[0]).toMatch(/^1\./);
    expect(steps[0]).toContain("→");
    expect(steps[0]).toContain("проверю");
  });

  it("ни одного слова модели не нужно: без narrative отчёт цел", () => {
    const text = buildDailyBrief({ state: stateFor(), findings: [], planned: [], applied: [], ownerNotes: [], narrative: null });
    expect(text).toContain("ИТОГ");
  });
});

describe("B750 — аварийное сообщение", () => {
  it("≤6 строк даже при пяти инцидентах", () => {
    const incidents = Array.from({ length: 5 }, (_, i) =>
      finding({ code: `i${i}`, severity: "incident", title: `Инцидент ${i}`, detail: "Подробности. ".repeat(30) }));
    const text = buildIncidentAlert({ now: AT_0900, incidents });
    expect(text.split("\n").length).toBeLessThanOrEqual(6);
    expect(text).toContain("Инцидент 0");
    expect(text).toMatch(/ещё 3/);
  });

  it("называет правку, которую сделает после доставки", () => {
    const text = buildIncidentAlert({
      now: AT_0900,
      incidents: [finding({ code: "x", severity: "incident", title: "Пул молчит", directive: directive("k") })],
    });
    expect(text).toContain("Делаю:");
  });
});
