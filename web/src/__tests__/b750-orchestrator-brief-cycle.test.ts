/**
 * B750 — проход оркестратора: ритм, порядок «записать → доставить → применить»,
 * единственность отправки между нодами. База — в памяти, внешние сервисы — моки.
 */

const store = new Map<string, string>();
const events: string[] = [];
let sendFails = false;
let onSend: (() => void) | null = null;
const rows = new Map<string, { key: string; status: string; reportedAt: Date | null; createdAt: Date }>();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    platformSetting: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
        store.has(where.key) ? { value: store.get(where.key) } : null),
      findMany: jest.fn(async ({ where }: { where: { key: { in: string[] } } }) =>
        where.key.in.filter((k) => store.has(k)).map((k) => ({ key: k, value: store.get(k) }))),
      create: jest.fn(async ({ data }: { data: { key: string; value: string } }) => {
        if (store.has(data.key)) throw new Error("P2002");
        store.set(data.key, data.value);
      }),
      updateMany: jest.fn(async ({ where, data }: { where: { key: string; value: string }; data: { value: string } }) => {
        if (store.get(where.key) !== where.value) return { count: 0 };
        store.set(where.key, data.value);
        return { count: 1 };
      }),
      upsert: jest.fn(async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
        store.set(where.key, create.value);
      }),
      deleteMany: jest.fn(async ({ where }: { where: { key: string } }) => {
        store.delete(where.key);
      }),
    },
    agentDirective: {
      findMany: jest.fn(async ({ where }: { where: { key?: { in: string[] } } }) =>
        where.key ? where.key.in.filter((k) => rows.has(k)).map((k) => rows.get(k)) : []),
      create: jest.fn(async ({ data }: { data: { key: string } }) => {
        if (rows.has(data.key)) throw new Error("P2002");
        rows.set(data.key, { key: data.key, status: "PLANNED", reportedAt: null, createdAt: new Date() });
        events.push(`store:${data.key}`);
      }),
      update: jest.fn(async ({ where, data }: { where: { key: string }; data: Record<string, unknown> }) => {
        Object.assign(rows.get(where.key) ?? {}, data);
      }),
    },
  },
}));

jest.mock("@/lib/telegram", () => ({
  sendTelegram: jest.fn(async (_chat: string, text: string) => {
    if (sendFails) throw new Error("telegram down");
    onSend?.();
    events.push(`send:${text.split("\n")[0].slice(0, 12)}`);
  }),
  sendTelegramPhoto: jest.fn(async () => undefined),
}));
jest.mock("@/lib/ops-notification-channel", () => ({ marketingDeliveryTargets: async () => ["1"] }));
jest.mock("@/lib/marketing/kpi", () => ({ kpiPressure: () => [], qualityBlocksGrowth: () => false }));
jest.mock("@/lib/marketing/kpi-readings", () => ({ readKpiVerdicts: async () => [] }));
jest.mock("@/lib/marketing/orchestrator-chart-sign", () => ({ signTrendPayload: () => null, trendChartUrl: () => "" }));
jest.mock("@/lib/marketing/orchestrator-prompt-amendment", () => ({ promptAmendmentDirective: async () => null }));
jest.mock("@/lib/marketing/orchestrator-actions", () => ({
  ...jest.requireActual("@/lib/marketing/orchestrator-actions"),
  applyDirective: jest.fn(async (d: { key: string }) => {
    events.push(`apply:${d.key}`);
    return { applied: true, previous: null };
  }),
}));

const directive = (key: string) => ({
  key,
  target: "seo" as const,
  action: "set_setting" as const,
  payload: { key: "seo.pages_per_day", value: 6 },
  problem: "мало страниц",
  rationale: "Поднимаю норму. Откат одной командой.",
  risk: "reversible" as const,
});
let findingsNow: unknown[] = [];
jest.mock("@/lib/marketing/orchestrator-diagnosis", () => ({
  diagnose: () => findingsNow,
  directivesFrom: (list: Array<{ directive?: unknown }>) => list.flatMap((f) => (f.directive ? [f.directive] : [])),
}));
jest.mock("@/lib/marketing/orchestrator-state", () => ({
  collectOrchestratorState: async ({ now }: { now: Date }) => ({
    now,
    providers: [],
    platforms: [],
    seo: { dailyCap: 4 },
    sources: { webmaster: null, webmasterError: "x", gsc: null, gscError: "y" },
    search: { impressions: null },
    causes: [],
    trend: { days: [], weeks: [], diversity: [], duplicateDraftIds: [] },
    backlinks: [],
  }),
}));
jest.mock("@/lib/marketing/orchestrator-report", () => ({
  ...jest.requireActual("@/lib/marketing/orchestrator-report"),
  narrativeFor: async () => null,
}));

import { runOrchestratorCycle, orchestratorReportRequested } from "@/lib/marketing/orchestrator";

const AT_0900 = new Date("2026-10-05T06:00:00Z");
const AT_0300 = new Date("2026-10-05T00:00:00Z");

beforeEach(() => {
  store.clear();
  events.length = 0;
  sendFails = false;
  onSend = null;
  rows.clear();
  findingsNow = [
    { code: "seo.stalled", severity: "warning", title: "SEO стоит", detail: "d", directive: directive("2026-10-05:seo") },
  ];
});

describe("B750 — суточная презентация в проходе", () => {
  it("записывает правку ДО отправки и применяет ПОСЛЕ, ставит отметку суток", async () => {
    const result = await runOrchestratorCycle({ now: AT_0900 });
    expect(result.reported).toBe(true);
    expect(events).toEqual([
      "store:2026-10-05:seo",
      expect.stringMatching(/^send:/),
      "apply:2026-10-05:seo",
    ]);
    expect(store.get("marketing.orchestrator.last_brief_at")).toBe(AT_0900.toISOString());
  });

  it("недоставленный отчёт: правка не применяется, отметка суток откатывается", async () => {
    sendFails = true;
    const result = await runOrchestratorCycle({ now: AT_0900 });
    expect(result.reported).toBe(false);
    expect(events.some((e) => e.startsWith("apply:"))).toBe(false);
    expect(store.has("marketing.orchestrator.last_brief_at")).toBe(false);
  });

  it("вторая нода в тот же час молчит", async () => {
    await runOrchestratorCycle({ now: AT_0900 });
    events.length = 0;
    const second = await runOrchestratorCycle({ now: new Date(AT_0900.getTime() + 60_000) });
    expect(second.reported).toBe(false);
    expect(events).toEqual([]);
  });

  it("до 09:00 неинцидентная находка ждёт презентации", async () => {
    const result = await runOrchestratorCycle({ now: AT_0300 });
    expect(result.reported).toBe(false);
    expect(events).toEqual([]);
  });

  it("report_now: отчёт вне расписания и флаг сброшен в false", async () => {
    store.set("marketing.orchestrator.last_brief_at", AT_0900.toISOString());
    store.set("marketing.orchestrator.report_now", "true");
    const result = await runOrchestratorCycle({ now: new Date(AT_0900.getTime() + 3 * 3_600_000) });
    expect(result.reported).toBe(true);
    expect(store.get("marketing.orchestrator.report_now")).toBe("false");
  });

  it("report_now при сбое доставки остаётся true — просьба не теряется", async () => {
    store.set("marketing.orchestrator.last_brief_at", AT_0900.toISOString());
    store.set("marketing.orchestrator.report_now", "true");
    sendFails = true;
    await runOrchestratorCycle({ now: new Date(AT_0900.getTime() + 3_600_000) });
    expect(store.get("marketing.orchestrator.report_now")).toBe("true");
  });
});

describe("B750 — сбой доставки не теряет правки и не крутится по кругу", () => {
  it("недоставленные строки подхватываются следующим проходом: доставка И применение", async () => {
    sendFails = true;
    await runOrchestratorCycle({ now: AT_0900 });
    expect(rows.get("2026-10-05:seo")?.status).toBe("PLANNED");
    sendFails = false;
    events.length = 0;
    const retry = await runOrchestratorCycle({ now: new Date(AT_0900.getTime() + 3_600_000) });
    expect(retry.reported).toBe(true);
    expect(retry.planned).toBe(1);
    expect(events).toEqual([expect.stringMatching(/^send:/), "apply:2026-10-05:seo"]);
  });

  it("report_now при сбое: пауза 15 мин, воркер и проход не ломятся каждую минуту", async () => {
    store.set("marketing.orchestrator.last_brief_at", AT_0900.toISOString());
    store.set("marketing.orchestrator.report_now", "true");
    sendFails = true;
    const failedAt = new Date(AT_0900.getTime() + 3_600_000);
    await runOrchestratorCycle({ now: failedAt });
    expect(store.get("marketing.orchestrator.report_now")).toBe("true");
    expect(store.has("marketing.orchestrator.delivery_retry_at")).toBe(true);
    expect(await orchestratorReportRequested(failedAt)).toBe(false);
    sendFails = false;
    events.length = 0;
    const soon = await runOrchestratorCycle({ now: new Date(failedAt.getTime() + 60_000) });
    expect(soon.reported).toBe(false);
    expect(events).toEqual([]);
    expect(await orchestratorReportRequested(new Date(failedAt.getTime() + 16 * 60_000))).toBe(true);
  });
});

describe("B750 — суточная презентация совпала с просьбой владельца", () => {
  it("report_now занят ДО отправки, а запрос, пришедший во время отправки, не стирается", async () => {
    store.set("marketing.orchestrator.report_now", "true");
    let during: string | undefined;
    onSend = () => {
      during = store.get("marketing.orchestrator.report_now");
      store.set("marketing.orchestrator.report_now", "true");
    };
    const result = await runOrchestratorCycle({ now: AT_0900 });
    expect(result.reported).toBe(true);
    expect(during).toBe("false");
    expect(store.get("marketing.orchestrator.report_now")).toBe("true");
  });
});

describe("B750 — инцидент сразу, коротко, без повторов", () => {
  beforeEach(() => {
    findingsNow = [
      { code: "pool.dead", severity: "incident", title: "Пул молчит", detail: "d", directive: directive("2026-10-05:pool") },
      { code: "seo.stalled", severity: "warning", title: "SEO стоит", detail: "d", directive: directive("2026-10-05:seo") },
    ];
  });

  it("до 09:00 уходит алерт и применяется только правка инцидента", async () => {
    const result = await runOrchestratorCycle({ now: AT_0300 });
    expect(result.reported).toBe(true);
    expect(events).toEqual([
      "store:2026-10-05:pool",
      expect.stringMatching(/^send:/),
      "apply:2026-10-05:pool",
    ]);
    expect(store.has("marketing.orchestrator.last_brief_at")).toBe(false);
  });

  it("повтор того же кода через час молчит", async () => {
    await runOrchestratorCycle({ now: AT_0300 });
    events.length = 0;
    const again = await runOrchestratorCycle({ now: new Date(AT_0300.getTime() + 3_600_000) });
    expect(again.reported).toBe(false);
    expect(events).toEqual([]);
  });

  it("сбой доставки алерта освобождает код — повтор будет", async () => {
    sendFails = true;
    await runOrchestratorCycle({ now: AT_0300 });
    expect([...store.keys()].some((k) => k.includes("incident."))).toBe(false);
  });
});
