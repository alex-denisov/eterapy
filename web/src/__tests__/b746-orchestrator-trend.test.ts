/**
 * B746 §4 — ОРКЕСТРАТОР ЧИТАЕТ ДАННЫЕ ПРОЕКТА И ПОКАЗЫВАЕТ ТЕНДЕНЦИЮ.
 *
 * Владелец 2026-09-15: «оркестратор живет полностью отрешенным от данных
 * проекта <…> раздавая устаревшие указания (например на Пикабу)»; «хочу чтоб
 * в отчётах видно было тенденцию — что изменилось и как улучшилось».
 *
 * Прогон: ряд и дельты считаются от строк; однотипность ленты становится
 * находкой с правкой; пул внешних площадок читает состояние из базы и не
 * содержит Пикабу; подпись картинки тренда проверяется.
 */

import {
  diversityFrom,
  duplicateDraftIdsFrom,
  trendDaysFrom,
  weekDeltasFrom,
  type PublicationRow,
} from "@/lib/marketing/orchestrator-trend";
import { diagnose, directivesFrom } from "@/lib/marketing/orchestrator-diagnosis";
import { backlinkPoolBlock, trendBlock } from "@/lib/marketing/orchestrator-report";
import { describeDirective } from "@/lib/marketing/orchestrator-actions";
import {
  BACKLINK_TARGETS,
  backlinkTargetsWithStatus,
  parseBacklinkStatus,
  pendingHumanTargets,
} from "@/lib/seo/backlink-targets";
import {
  signTrendPayload,
  trendChartUrl,
  verifyTrendPayload,
} from "@/lib/marketing/orchestrator-chart-sign";
import type { OrchestratorState } from "@/lib/marketing/orchestrator-state";

const NOW = new Date("2026-09-15T11:00:00Z");

function row(over: Partial<PublicationRow> & { id: string }): PublicationRow {
  return {
    platform: "telegram",
    status: "PUBLISHED",
    title: "Тема",
    publishedAt: new Date(NOW.getTime() - 60 * 60_000),
    scheduledFor: null,
    mediaUrl: "https://eterapy.com/api/marketing/media/x",
    utmContent: "tema",
    notes: JSON.stringify({ format: "карточка дня" }),
    agentReviewedAt: null,
    views: 10,
    ...over,
  };
}

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
    platforms: [{ platform: "telegram", published: 3, stalled: 0, topReason: null }],
    signals: [],
    seo: { publishedToday: 2, publishedWeek: 9, dailyCap: 4, queueNew: 12, queueRejected: 3, neverSubmitted: 0, lastPublishedAt: new Date(NOW.getTime() - 60 * 60_000) },
    search: { impressions: 120, clicks: 7, averagePosition: 18.4, searchablePages: 43, previousImpressions: 110 },
    sources: { webmaster: null, webmasterError: null, gsc: null, gscError: null } as unknown as OrchestratorState["sources"],
    thinCards: 0,
    dzen: null,
    vertexConfigured: true,
    trend: { days: [], weeks: [], diversity: [], duplicateDraftIds: [] },
    backlinks: [],
    causes: [],
    stalledIds: [],
    recentDirectives: [],
    ...over,
  };
}

describe("B746 §4 — ряд и разнообразие считаются от строк", () => {
  it("однотипность ленты: повтор заголовка, доля картинок, число форматов", () => {
    const rows = [
      row({ id: "1", title: "9 аркан (Отшельник)" }),
      row({ id: "2", title: "9 аркан (Отшельник)" }),
      row({ id: "3", title: "9 аркан (Отшельник)", mediaUrl: null, notes: JSON.stringify({ format: "чек-лист" }) }),
      row({ id: "4", title: "Натальная карта" }),
      row({ id: "5", title: "Сны", platform: "threads", mediaUrl: null }),
      row({ id: "6", title: "в архиве", status: "ARCHIVED" }),
    ];
    const diversity = diversityFrom(rows);
    const telegram = diversity.find((feed) => feed.platform === "telegram")!;
    expect(telegram.posts).toBe(4);
    expect(telegram.distinctTitles).toBe(2);
    expect(telegram.topTitle).toBe("9 аркан (Отшельник)");
    expect(telegram.topTitleCount).toBe(3);
    expect(telegram.mediaShare).toBeCloseTo(0.75);
    expect(telegram.formats).toBe(2);
    expect(diversity.find((feed) => feed.platform === "threads")!.mediaShare).toBe(0);
  });

  it("суточный ряд и дельты недели к неделе", () => {
    const day = (offset: number) => new Date(NOW.getTime() - offset * 24 * 60 * 60_000);
    const rows = [
      row({ id: "a", publishedAt: day(0), views: 5 }),
      row({ id: "b", publishedAt: day(1), views: 7, title: "Другая" }),
      row({ id: "c", publishedAt: day(9), views: 100 }),
    ];
    const days = trendDaysFrom({
      now: NOW,
      publications: rows,
      seoPublishedAt: [day(0), day(0), day(8)],
      snapshots: [{ dayKey: "2026-09-15", impressions: 40, clicks: 2 }],
    });
    expect(days).toHaveLength(14);
    expect(days.at(-1)).toMatchObject({ day: "2026-09-15", posts: 1, views: 5, seoPages: 2, impressions: 40, clicks: 2 });
    // День без среза — «не снимали», а не ноль.
    expect(days.at(-2)!.impressions).toBeNull();
    const weeks = weekDeltasFrom(days);
    const posts = weeks.find((delta) => delta.metric === "posts")!;
    expect(posts).toMatchObject({ current: 2, previous: 1 });
    const views = weeks.find((delta) => delta.metric === "views")!;
    expect(views).toMatchObject({ current: 12, previous: 100 });
    const seo = weeks.find((delta) => delta.metric === "seoPages")!;
    expect(seo).toMatchObject({ current: 2, previous: 1 });
  });

  it("черновики-дубли: пустой черновик по уже занятой теме площадки", () => {
    const rows = [
      row({ id: "pub", status: "PUBLISHED", utmContent: "arkan-9" }),
      row({ id: "d1", status: "DRAFT", utmContent: "arkan-9", scheduledFor: new Date(NOW.getTime() + 3_600_000) }),
      row({ id: "d2", status: "DRAFT", utmContent: "novaya", scheduledFor: new Date(NOW.getTime() + 3_600_000) }),
      row({ id: "d3", status: "DRAFT", utmContent: "novaya", scheduledFor: new Date(NOW.getTime() + 7_200_000) }),
      // Написанный черновик судит редактор, не оркестратор.
      row({ id: "written", status: "DRAFT", utmContent: "arkan-9", agentReviewedAt: NOW }),
      // Другая площадка — другая лента: не дубль.
      row({ id: "other", status: "DRAFT", utmContent: "arkan-9", platform: "vk" }),
    ];
    expect(duplicateDraftIdsFrom(rows).sort()).toEqual(["d1", "d3"]);
  });
});

describe("B746 §4 — находки и правки по разнообразию", () => {
  it("повтор заголовка трижды за неделю — предупреждение", () => {
    const findings = diagnose(baseState({
      trend: {
        days: [],
        weeks: [],
        diversity: [{ platform: "telegram", posts: 12, distinctTitles: 5, mediaShare: 1, topTitle: "9 аркан (Отшельник)", topTitleCount: 4, formats: 2 }],
        duplicateDraftIds: [],
      },
    }));
    const sameness = findings.find((finding) => finding.code === "smm.sameness.telegram");
    expect(sameness?.severity).toBe("warning");
    expect(sameness?.title).toContain("4 раз");
    expect(findings.find((finding) => finding.code === "smm.media_everywhere")?.title).toContain("telegram");
  });

  it("разнообразная лента находок не даёт", () => {
    const findings = diagnose(baseState({
      trend: {
        days: [],
        weeks: [],
        diversity: [{ platform: "telegram", posts: 12, distinctTitles: 11, mediaShare: 0.4, topTitle: "x", topTitleCount: 2, formats: 6 }],
        duplicateDraftIds: [],
      },
    }));
    expect(findings.filter((finding) => finding.code.startsWith("smm.sameness"))).toHaveLength(0);
    expect(findings.filter((finding) => finding.code === "smm.media_everywhere")).toHaveLength(0);
  });

  it("черновики-дубли — правка «снять», обратимая, с человеческим именем", () => {
    const findings = diagnose(baseState({
      trend: { days: [], weeks: [], diversity: [], duplicateDraftIds: ["d1", "d2"] },
    }));
    const directive = directivesFrom(findings).find((entry) => entry.action === "retire_duplicate_drafts");
    expect(directive).toBeDefined();
    expect(directive!.risk).toBe("reversible");
    expect(directive!.payload.ids).toEqual(["d1", "d2"]);
    expect(describeDirective(directive!)).toBe("снять черновиков-дублей: 2");
  });
});

describe("B746 §4 — отчёт: тренд и внешние площадки", () => {
  it("блок тренда — числа со стрелками, стрелка по направлению «лучше»", () => {
    const lines = trendBlock({
      days: [],
      weeks: [
        { metric: "posts", label: "Постов вышло", current: 30, previous: 20, better: "up", unit: "" },
        { metric: "distinctShare", label: "Разных заголовков", current: 40, previous: 70, better: "up", unit: "%" },
        { metric: "views", label: "Просмотров", current: 0, previous: 0, better: "up", unit: "" },
      ],
      diversity: [{ platform: "telegram", posts: 12, distinctTitles: 5, mediaShare: 1, topTitle: "9 аркан (Отшельник) в матрице судьбы", topTitleCount: 4, formats: 2 }],
      duplicateDraftIds: [],
    }).join("\n");
    expect(lines).toContain("▲ Постов вышло: <b>30</b> ← 20 (+50 %)");
    expect(lines).toContain("▼ Разных заголовков: <b>40%</b> ← 70%");
    expect(lines).toContain("＝ Просмотров");
    expect(lines).toContain("telegram: 5/12 · 100 % · 2 · повтор ×4");
  });

  it("Пикабу снят из реестра, сделанное не просится, отклонённое не повторяется", () => {
    expect(BACKLINK_TARGETS.map((target) => target.id)).not.toContain("pikabu");
    const status = parseBacklinkStatus(JSON.stringify({
      "yandex-business": { status: "done", updatedAt: "2026-09-15T10:00:00Z" },
      "google-business": { status: "skipped" },
      "мусор": { status: "что-то" },
    }));
    expect(Object.keys(status).sort()).toEqual(["google-business", "yandex-business"]);
    expect(pendingHumanTargets(status)).toHaveLength(0);
    expect(pendingHumanTargets({}).map((target) => target.id).sort()).toEqual(["google-business", "yandex-business"]);
    // Понедельник: сделанное называется сделанным, ждущее — просится.
    const monday = new Date("2026-09-14T09:00:00Z");
    const withStatus = backlinkTargetsWithStatus(parseBacklinkStatus(JSON.stringify({ "yandex-business": { status: "done" } })));
    const block = backlinkPoolBlock(monday, withStatus).join("\n");
    expect(block).toContain("Google Business Profile");
    expect(block).not.toMatch(/• <b>Яндекс Бизнес/);
    expect(block).toContain("✅ Сделано: Яндекс Бизнес");
    // Всё сделано — блока нет вовсе… кроме строки «сделано» в понедельник.
    const allDone = backlinkTargetsWithStatus(status);
    expect(backlinkPoolBlock(monday, allDone).join("\n")).toContain("✅ Сделано");
    expect(backlinkPoolBlock(new Date("2026-09-15T09:00:00Z"), allDone)).toEqual([]);
  });

  it("картинка тренда рисуется только по подписанной нагрузке", () => {
    process.env.AUTH_SECRET = "test-secret";
    const payload = {
      at: NOW.toISOString(),
      days: [{ day: "2026-09-15", posts: 1, distinctTitles: 1, views: 5, seoPages: 0, impressions: null, clicks: null }],
      weeks: [{ label: "Постов вышло", current: 1, previous: 0, better: "up" as const, unit: "" }],
    };
    const signed = signTrendPayload(payload)!;
    expect(signed).not.toBeNull();
    expect(verifyTrendPayload(signed.d, signed.s)).toEqual(payload);
    expect(verifyTrendPayload(signed.d, `${signed.s.slice(0, -1)}0`)).toBeNull();
    expect(verifyTrendPayload(null, signed.s)).toBeNull();
    const url = new URL(trendChartUrl("https://eterapy.com/", signed));
    expect(url.pathname).toBe("/api/marketing/orchestrator/trend");
    expect(url.searchParams.get("s")).toBe(signed.s);
  });
});
