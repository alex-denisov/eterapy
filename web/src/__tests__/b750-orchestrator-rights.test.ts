import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockDb = {
  agentDirective: { findMany: jest.fn() },
  seoKeywordCandidate: { findUnique: jest.fn(), upsert: jest.fn() },
  seoLibraryPage: { findFirst: jest.fn(), update: jest.fn() },
  platformSetting: { findUnique: jest.fn(), upsert: jest.fn() },
};
jest.mock("@/lib/db", () => ({ __esModule: true, default: mockDb }));
jest.mock("@/lib/logger", () => ({ log: { error: jest.fn(), warn: jest.fn(), info: jest.fn() }, serializeError: (e: unknown) => String(e) }));
jest.mock("@/lib/ai-gateway/prompts", () => ({ updateAIPromptConfig: jest.fn() }));
jest.mock("@/lib/seo/page-agent", () => ({
  moscowDayBounds: () => ({ start: new Date("2026-10-04T21:00:00Z"), end: new Date("2026-10-05T21:00:00Z") }),
}));
jest.mock("@/lib/seo/demand/harvest", () => {
  const actual = jest.requireActual("@/lib/seo/demand/harvest");
  return { ...actual, coveredPhraseSet: jest.fn().mockResolvedValue(new Set()) };
});
const submit = jest.fn();
jest.mock("@/lib/marketing/seo-coverage", () => ({ submitUrlsForRecrawl: (...a: unknown[]) => submit(...a) }));

import {
  FORBIDDEN_DOMAINS,
  SETTING_BOUNDS,
  applyDirective,
  type DirectiveAction,
  type OrchestratorDirective,
} from "@/lib/marketing/orchestrator-actions";

const directive = (action: DirectiveAction, payload: Record<string, unknown>): OrchestratorDirective => ({
  key: `k:${action}`, target: "seo", action, payload, problem: "p", rationale: "r", risk: "reversible",
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.agentDirective.findMany.mockResolvedValue([]);
  mockDb.seoKeywordCandidate.findUnique.mockResolvedValue(null);
  mockDb.platformSetting.findUnique.mockResolvedValue(null);
});

describe("queue_keyword", () => {
  const ok = { phrase: "  Почему мне не везёт в любви ", monthlyDemand: 800 };
  it("кладёт нормализованную фразу NEW/orchestrator, снимок null", async () => {
    const out = await applyDirective(directive("queue_keyword", ok));
    expect(out.applied).toBe(true);
    expect(out.previous).toEqual({ phrase: "почему мне не везёт в любви", existed: false });
    expect(mockDb.seoKeywordCandidate.upsert.mock.calls[0][0].create).toMatchObject({
      phrase: "почему мне не везёт в любви", source: "orchestrator", status: "NEW", monthlyDemand: 800,
    });
  });
  it("отказывает ниже пола, по длине, по стоп-слову, при потолке, при фразе в работе", async () => {
    expect((await applyDirective(directive("queue_keyword", { ...ok, monthlyDemand: 299 }))).applied).toBe(false);
    expect((await applyDirective(directive("queue_keyword", { phrase: "любовь", monthlyDemand: 800 }))).applied).toBe(false);
    expect((await applyDirective(directive("queue_keyword", { phrase: "как сделать взлом аккаунта быстро", monthlyDemand: 800 }))).applied).toBe(false);
    mockDb.agentDirective.findMany.mockResolvedValueOnce(Array(10).fill({ payload: {} }));
    expect((await applyDirective(directive("queue_keyword", ok))).error).toMatch(/потолок/);
    mockDb.seoKeywordCandidate.findUnique.mockResolvedValueOnce({ status: "USED" });
    expect((await applyDirective(directive("queue_keyword", ok))).applied).toBe(false);
    expect(mockDb.seoKeywordCandidate.upsert).not.toHaveBeenCalled();
  });
  it("не бросает при сбое базы", async () => {
    mockDb.seoKeywordCandidate.findUnique.mockRejectedValueOnce(new Error("db down"));
    const out = await applyDirective(directive("queue_keyword", ok));
    expect(out).toMatchObject({ applied: false, error: "db down" });
  });
});

describe("retire/restore_library_page", () => {
  it("снимает только PUBLISHED страницу базы, снимок {slug,status}", async () => {
    mockDb.seoLibraryPage.findFirst.mockResolvedValue({ slug: "x-db-page", status: "PUBLISHED" });
    const out = await applyDirective(directive("retire_library_page", { slug: "x-db-page" }));
    expect(out).toMatchObject({ applied: true, previous: { slug: "x-db-page", status: "PUBLISHED" } });
    expect(mockDb.seoLibraryPage.update).toHaveBeenCalledWith({ where: { slug: "x-db-page" }, data: { status: "RETIRED" } });
  });
  it("после снятия слаг уходит из seo.retire_approved; сбой чистки не отменяет снятие", async () => {
    mockDb.seoLibraryPage.findFirst.mockResolvedValue({ slug: "x", status: "PUBLISHED" });
    mockDb.platformSetting.findUnique.mockResolvedValueOnce({ value: JSON.stringify(["x", "y", 5]) });
    const out = await applyDirective(directive("retire_library_page", { slug: "x" }));
    expect(out.applied).toBe(true);
    expect(JSON.parse(mockDb.platformSetting.upsert.mock.calls[0][0].update.value)).toEqual(["y"]);
    mockDb.platformSetting.findUnique.mockRejectedValueOnce(new Error("boom"));
    expect((await applyDirective(directive("retire_library_page", { slug: "x" }))).applied).toBe(true);
  });
  it("после возврата слаг уходит из seo.restore_requested; сбой чистки не фатален", async () => {
    mockDb.seoLibraryPage.findFirst.mockResolvedValue({ slug: "x", status: "RETIRED" });
    mockDb.platformSetting.findUnique.mockResolvedValueOnce({ value: JSON.stringify(["x", "y"]) });
    expect((await applyDirective(directive("restore_library_page", { slug: "x" }))).applied).toBe(true);
    const call = mockDb.platformSetting.upsert.mock.calls[0][0];
    expect(call.where.key).toBe("seo.restore_requested");
    expect(JSON.parse(call.update.value)).toEqual(["y"]);
    mockDb.platformSetting.findUnique.mockRejectedValueOnce(new Error("boom"));
    expect((await applyDirective(directive("restore_library_page", { slug: "x" }))).applied).toBe(true);
  });
  it("не трогает DRAFT и отсутствующие", async () => {
    mockDb.seoLibraryPage.findFirst.mockResolvedValueOnce({ slug: "s", status: "DRAFT" });
    expect((await applyDirective(directive("retire_library_page", { slug: "s" }))).applied).toBe(false);
    mockDb.seoLibraryPage.findFirst.mockResolvedValueOnce(null);
    expect((await applyDirective(directive("retire_library_page", { slug: "s" }))).applied).toBe(false);
    expect(mockDb.seoLibraryPage.update).not.toHaveBeenCalled();
  });
  it("слаг статического корпуса отвергается", async () => {
    const { approvedLibraryEntries } = await import("@/data/anonymous-library");
    const slug = approvedLibraryEntries()[0].slug;
    const out = await applyDirective(directive("retire_library_page", { slug }));
    expect(out.applied).toBe(false);
    expect(mockDb.seoLibraryPage.findFirst).not.toHaveBeenCalled();
  });
  it("потолок 3 в сутки; restore — обратный переход", async () => {
    mockDb.agentDirective.findMany.mockResolvedValueOnce([{}, {}, {}]);
    expect((await applyDirective(directive("retire_library_page", { slug: "s" }))).error).toMatch(/потолок/);
    mockDb.seoLibraryPage.findFirst.mockResolvedValueOnce({ slug: "s", status: "RETIRED" });
    const out = await applyDirective(directive("restore_library_page", { slug: "s" }));
    expect(out.applied).toBe(true);
    expect(mockDb.seoLibraryPage.update).toHaveBeenCalledWith({ where: { slug: "s" }, data: { status: "PUBLISHED" } });
  });
});

describe("parseRetireApproved", () => {
  it("защитный разбор", async () => {
    const { parseRetireApproved } = await import("@/lib/marketing/orchestrator-rights");
    expect(parseRetireApproved("not json")).toEqual([]);
    expect(parseRetireApproved('{"a":1}')).toEqual([]);
    expect(parseRetireApproved(JSON.stringify(["a", 1, null, "a", " "]))).toEqual(["a"]);
    expect(parseRetireApproved(JSON.stringify(Array.from({ length: 30 }, (_, i) => `s${i}`)))).toHaveLength(20);
  });
});

describe("mark_backlink_step", () => {
  it("пишет статус с заметкой и снимком прежней записи", async () => {
    const { BACKLINK_TARGETS } = await import("@/lib/seo/backlink-targets");
    const id = BACKLINK_TARGETS[0].id;
    mockDb.platformSetting.findUnique.mockResolvedValue({ value: JSON.stringify({ [id]: { status: "pending" } }) });
    const out = await applyDirective(directive("mark_backlink_step", { id, status: "done", note: "готово" }));
    expect(out.applied).toBe(true);
    expect(out.previous).toEqual({ id, entry: { status: "pending" } });
    const saved = JSON.parse(mockDb.platformSetting.upsert.mock.calls[0][0].update.value);
    expect(saved[id]).toMatchObject({ status: "done", note: "готово" });
  });
  it("отвергает чужой id и неверный статус", async () => {
    expect((await applyDirective(directive("mark_backlink_step", { id: "nope", status: "done" }))).applied).toBe(false);
    const { BACKLINK_TARGETS } = await import("@/lib/seo/backlink-targets");
    expect((await applyDirective(directive("mark_backlink_step", { id: BACKLINK_TARGETS[0].id, status: "x" }))).applied).toBe(false);
  });
});

describe("recrawl_urls", () => {
  it("принимает свои адреса, до 5 за раз", async () => {
    submit.mockResolvedValue(["https://eterapy.com/library/a"]);
    const out = await applyDirective(directive("recrawl_urls", { urls: ["https://eterapy.com/library/a"] }));
    expect(out.applied).toBe(true);
    const six = Array.from({ length: 6 }, (_, i) => `https://eterapy.com/library/${i}`);
    expect((await applyDirective(directive("recrawl_urls", { urls: six }))).applied).toBe(false);
  });
  it("отвергает чужие и обманные адреса", async () => {
    for (const bad of ["https://evil.com/", "https://eterapy.com.evil.com/x", "https://eterapy.com@evil.com/", "http://eterapy.com/x"]) {
      expect((await applyDirective(directive("recrawl_urls", { urls: [bad] }))).applied).toBe(false);
    }
    expect(submit).not.toHaveBeenCalled();
  });
  it("суточный потолок 20 адресов и отказ Вебмастера", async () => {
    mockDb.agentDirective.findMany.mockResolvedValueOnce([{ payload: { urls: Array(18).fill("u") } }]);
    expect((await applyDirective(directive("recrawl_urls", { urls: ["https://eterapy.com/a", "https://eterapy.com/b", "https://eterapy.com/c"] }))).error).toMatch(/потолок/);
    submit.mockResolvedValueOnce([]);
    expect((await applyDirective(directive("recrawl_urls", { urls: ["https://eterapy.com/a"] }))).applied).toBe(false);
  });
});

describe("жёсткий перечень «никогда»", () => {
  it("set_setting вне белого списка отвергается, включая зоны FORBIDDEN_DOMAINS", async () => {
    for (const key of [...FORBIDDEN_DOMAINS, "payments.enabled", "price_rates.base", "DATABASE_URL"]) {
      expect((await applyDirective(directive("set_setting", { key, value: 1 }))).applied).toBe(false);
    }
    for (const key of Object.keys(SETTING_BOUNDS)) {
      for (const domain of FORBIDDEN_DOMAINS) expect(key).not.toContain(domain);
    }
  });
  it("нет действия сырого SQL или shell", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/marketing/orchestrator-actions.ts"), "utf8");
    const actions = /export type DirectiveAction =([^;]+);/.exec(src)![1];
    expect(actions).not.toMatch(/sql|shell|exec|command|migrat|deploy/i);
    for (const file of ["orchestrator-actions.ts", "orchestrator-rights.ts"]) {
      const text = readFileSync(join(process.cwd(), "src/lib/marketing", file), "utf8");
      expect(text).not.toMatch(/\$queryRaw|\$executeRaw|child_process|execSync|spawn\(/);
      expect(text).not.toMatch(/\bdb\.(user|session|account|payment\w*|wallet\w*|order\w*|subscription\w*|priceRate|tariff\w*)\b/i);
      expect(text).not.toMatch(/Prisma\.(User|Session|Account|Payment|Wallet|Order|Subscription|PriceRate)/);
      expect(text).not.toMatch(/from "@\/lib\/(payments|auth)/);
    }
  });
  it("у каждого нового действия есть суточный потолок", async () => {
    const { RIGHTS_DAILY_CAPS } = await import("@/lib/marketing/orchestrator-rights");
    expect(Object.keys(RIGHTS_DAILY_CAPS).sort()).toEqual(
      ["mark_backlink_step", "queue_keyword", "recrawl_urls", "restore_library_page", "retire_library_page"],
    );
  });
});
