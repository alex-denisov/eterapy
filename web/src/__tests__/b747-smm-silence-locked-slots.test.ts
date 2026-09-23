/**
 * B747 — НЕДЕЛЯ БЕЗ SMM.
 *
 * Прод 17.09–22.09: ни одного поста. Разовая чистка B746 сняла 43 пустых
 * черновика, не освободив их ключи плана, и планировщик считал слоты занятыми.
 * Оркестратор тишины не видел (находки SMM строились из вставших материалов),
 * а 16–20.09 его отчёт не доходил: «message is too long», правки не
 * применялись.
 *
 * Прогон: длинный отчёт режется на части; тишина ленты — находка с порогом от
 * её собственного шага; запертые слоты отпускаются правкой, которая сама
 * перепроверяет «пустоту» строки в базе; снятый дубль отпускает слот.
 */

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: { findMany: jest.fn(), updateMany: jest.fn() },
  },
}));

import { readFileSync } from "fs";
import { join } from "path";
import db from "@/lib/db";
import { splitForTelegram } from "@/lib/marketing/orchestrator-report";
import {
  diagnose,
  directivesFrom,
  silentThresholdHours,
} from "@/lib/marketing/orchestrator-diagnosis";
import { applyDirective, describeDirective, type OrchestratorDirective } from "@/lib/marketing/orchestrator-actions";
import { feedsFrom, type OrchestratorState } from "@/lib/marketing/orchestrator-state";

const NOW = new Date("2026-09-22T12:00:00Z");
const HOUR = 60 * 60_000;

const findMany = db.externalPublication.findMany as unknown as jest.Mock;
const updateMany = db.externalPublication.updateMany as unknown as jest.Mock;

function baseState(over: Partial<OrchestratorState> = {}): OrchestratorState {
  return {
    now: NOW,
    conveyor: {
      demand: 4, buffer: 6, ready: 5, awaitingReview: 2, maxAwaitingReview: 6, writtenThisHour: 1,
      deferred: 3, perHour: 2, writerBudget: 1, capacityPerHour: 2, materialsLeftToday: 10,
      canSeparateRoles: true, bottleneck: "buffer", pausedUntil: null, idleReason: "Линия работает",
    },
    providers: [
      { provider: "GEMINI", enabled: true, lastSuccessAt: new Date(NOW.getTime() - 60_000), lastErrorAt: null, lastErrorCode: null },
      { provider: "MISTRAL", enabled: true, lastSuccessAt: new Date(NOW.getTime() - 60_000), lastErrorAt: null, lastErrorCode: null },
    ],
    platforms: [],
    signals: [],
    seo: { publishedToday: 2, publishedWeek: 9, dailyCap: 4, queueNew: 12, queueRejected: 3, neverSubmitted: 0, lastPublishedAt: new Date(NOW.getTime() - HOUR) },
    search: { impressions: 120, clicks: 7, averagePosition: 18.4, searchablePages: 43, previousImpressions: 110 },
    sources: { webmaster: null, webmasterError: null, gsc: null, gscError: null } as unknown as OrchestratorState["sources"],
    thinCards: 0,
    dzen: null,
    vertexConfigured: true,
    trend: { days: [], weeks: [], diversity: [], duplicateDraftIds: [] },
    backlinks: [],
    causes: [],
    stalledIds: [],
    feeds: [],
    lockedSlotIds: [],
    recentDirectives: [],
    ...over,
  };
}

describe("B747 — отчёт оркестратора не теряется из-за длины", () => {
  it("короткий отчёт уходит одним сообщением", () => {
    expect(splitForTelegram("<b>Отчёт</b>\nвсё спокойно")).toEqual(["<b>Отчёт</b>\nвсё спокойно"]);
  });

  it("длинный отчёт режется по строкам, каждая часть в пределе, строки целы", () => {
    const lines = Array.from({ length: 120 }, (_, index) => `• <b>Находка ${index}</b>: ${"слово ".repeat(12).trim()}`);
    const text = lines.join("\n");
    expect(text.length).toBeGreaterThan(4096);
    const parts = splitForTelegram(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(4000);
    const rejoined = parts.join("\n").split("\n");
    expect(rejoined).toEqual(lines);
  });

  it("строка длиннее предела режется по символам, ничего не теряя", () => {
    const parts = splitForTelegram("x".repeat(9000), 4000);
    expect(parts.map((part) => part.length)).toEqual([4000, 4000, 1000]);
  });

  it("доставка отчёта идёт через резку", () => {
    const source = readFileSync(join(__dirname, "../lib/marketing/orchestrator.ts"), "utf8");
    expect(source).toMatch(/for \(const part of splitForTelegram\(message\)\) await sendTelegram\(chatId, part\)/);
  });
});

describe("B747 — тишина ленты видна диагнозу", () => {
  it("порог от шага ленты: Telegram 3/сутки — 36 ч, Instagram раз в двое суток — 96 ч", () => {
    expect(silentThresholdHours(42)).toBe(36);
    expect(silentThresholdHours(7)).toBe(96);
    expect(silentThresholdHours(0)).toBe(36);
  });

  it("шесть суток без поста при запертых слотах — инцидент и правка «отпустить слоты»", () => {
    const findings = diagnose(baseState({
      feeds: [
        { platform: "telegram", lastPublishedAt: new Date(NOW.getTime() - 139 * HOUR), publishedFortnight: 21 },
        { platform: "instagram", lastPublishedAt: new Date(NOW.getTime() - 60 * HOUR), publishedFortnight: 7 },
      ],
      lockedSlotIds: ["a", "b", "c"],
    }));
    const silent = findings.filter((finding) => finding.code.startsWith("smm.silent."));
    expect(silent.map((finding) => finding.code)).toEqual(["smm.silent.telegram"]);
    expect(silent[0].severity).toBe("incident");
    expect(silent[0].title).toContain("139 ч");

    const locked = findings.find((finding) => finding.code === "smm.locked_slots");
    expect(locked?.severity).toBe("incident");
    const directive = directivesFrom(findings).find((entry) => entry.action === "release_locked_slots");
    expect(directive).toMatchObject({ risk: "reversible", target: "conveyor", payload: { ids: ["a", "b", "c"] } });
    expect(describeDirective(directive!)).toBe("отпустить запертых слотов плана: 3");
  });

  it("площадка плана без единого выпуска — тоже тишина; без запертых слотов — шаг человеку", () => {
    const findings = diagnose(baseState({
      feeds: [{ platform: "dzen", lastPublishedAt: null, publishedFortnight: 0 }],
    }));
    const silent = findings.find((finding) => finding.code === "smm.silent.dzen");
    expect(silent?.ownerAction?.what).toContain("dzen");
    expect(directivesFrom(findings).some((entry) => entry.action === "release_locked_slots")).toBe(false);
  });

  it("база не ответила — ни одной ложной тревоги о тишине", () => {
    expect(feedsFrom(null, ["telegram", "vk"])).toEqual([]);
    const findings = diagnose(baseState({ feeds: [] }));
    expect(findings.some((finding) => finding.code.startsWith("smm.silent."))).toBe(false);
  });

  it("лента сводится без учёта регистра площадки", () => {
    const feeds = feedsFrom({
      last: [
        { platform: "Telegram", _max: { publishedAt: new Date("2026-09-16T16:58:00Z") } },
        { platform: "telegram", _max: { publishedAt: new Date("2026-09-15T10:00:00Z") } },
      ],
      fortnight: [
        { platform: "Telegram", _count: { _all: 2 } },
        { platform: "telegram", _count: { _all: 19 } },
      ],
    }, ["telegram", "vk"]);
    expect(feeds).toEqual([
      { platform: "telegram", lastPublishedAt: new Date("2026-09-16T16:58:00Z"), publishedFortnight: 21 },
      { platform: "vk", lastPublishedAt: null, publishedFortnight: 0 },
    ]);
  });
});

describe("B747 — слот отпускается, а не запирается", () => {
  const base: OrchestratorDirective = {
    key: "2026-09-23:smm.release_locked_slots",
    target: "conveyor",
    action: "release_locked_slots",
    payload: { ids: ["a", "b"] },
    problem: "p",
    rationale: "r",
    risk: "reversible",
  };

  beforeEach(() => {
    findMany.mockReset();
    updateMany.mockReset();
  });

  it("отпускаются только пустые оболочки — условие повторено в базе", async () => {
    findMany.mockResolvedValue([{ id: "a", planSlot: "b610-2w-dzen-20260925-01" }]);
    updateMany.mockResolvedValue({ count: 1 });
    const outcome = await applyDirective(base);
    expect(outcome.applied).toBe(true);
    expect(outcome.previous).toEqual({ rows: [{ id: "a", planSlot: "b610-2w-dzen-20260925-01" }] });
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      id: { in: ["a", "b"] },
      status: "ARCHIVED",
      planSlot: { not: null },
      publishedAt: null,
      agentReviewedAt: null,
      attemptCount: 0,
    });
    expect(where.agentWriterDraft).toBeDefined();
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: ["a"] } }, data: { planSlot: null } });
  });

  it("ни одной пустой оболочки — правка не применена и названа причина", async () => {
    findMany.mockResolvedValue([]);
    const outcome = await applyDirective(base);
    expect(outcome.applied).toBe(false);
    expect(outcome.error).toContain("пустых запертых слотов");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("снятый дубль отпускает слот, ключ остаётся в снимке для отката", async () => {
    findMany.mockResolvedValue([{ id: "d1", status: "DRAFT", planSlot: "b610-2w-telegram-20260924-01" }]);
    updateMany.mockResolvedValue({ count: 1 });
    const outcome = await applyDirective({ ...base, action: "retire_duplicate_drafts", payload: { ids: ["d1"] } });
    expect(outcome.applied).toBe(true);
    expect(outcome.previous).toEqual({ rows: [{ id: "d1", status: "DRAFT", planSlot: "b610-2w-telegram-20260924-01" }] });
    expect(updateMany.mock.calls[0][0].data).toMatchObject({ status: "ARCHIVED", planSlot: null });
  });
});
