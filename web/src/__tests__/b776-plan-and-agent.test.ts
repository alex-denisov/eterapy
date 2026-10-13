jest.mock("@/lib/db", () => ({ __esModule: true, default: {} }));

import { contentPlanFor } from "@/lib/marketing/content-plan";
import { expertChainTask, replyWithCta } from "@/lib/marketing/agent";
import { SERIES_FORMAT } from "@/lib/marketing/threads-series";

const NOW = new Date("2026-10-13T10:00:00Z");
const SERIES = { active: true, startDate: "2026-10-14", days: 30, title: "t" };

describe("B776: план и задача автора", () => {
  it("без серии план Threads не содержит формата серии", () => {
    expect(contentPlanFor(NOW).some((slot) => slot.format === SERIES_FORMAT.label)).toBe(false);
  });

  it("с серией — ровно один пост серии в сутки, вечерний слот, номер суток растёт", () => {
    const plan = contentPlanFor(NOW, SERIES).filter((slot) => slot.channel === "threads");
    const posts = plan.filter((slot) => slot.format === SERIES_FORMAT.label);
    expect(posts.length).toBeGreaterThan(5);
    expect(new Set(posts.map((slot) => slot.scheduledAt.slice(0, 10))).size).toBe(posts.length);
    expect(posts[0].formatSeries).toEqual({ day: 1, total: 30, isAnnouncement: true });
    expect(posts[1].formatSeries?.day).toBe(2);
    for (const post of posts) {
      expect(post.formatLink).toBe(false);
      expect(post.formatReply).toBe("continuation");
      expect(post.formatRules?.join("\n")).toMatch(new RegExp(`День ${post.formatSeries!.day}/30`));
    }
  });

  it("не больше одного слота с призывом в сутки; правило призыва только у него", () => {
    const plan = contentPlanFor(NOW, SERIES).filter((slot) => slot.channel === "threads");
    const perDay = new Map<string, number>();
    for (const slot of plan.filter((item) => item.formatCta)) {
      const day = slot.scheduledAt.slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      expect(slot.formatRules?.join("\n")).toMatch(/ctaTarget/);
    }
    expect([...perDay.values()].every((count) => count === 1)).toBe(true);
    for (const slot of plan.filter((item) => !item.formatCta)) expect(slot.formatRules?.join("\n") ?? "").not.toMatch(/ctaTarget/);
  });

  it("задача автора: серия и призыв только у цепочек", () => {
    expect(expertChainTask(null)).toEqual({});
    expect(expertChainTask({ formatReply: "forecast" })).toEqual({});
    const task = expertChainTask({ formatReply: "continuation", formatSeries: { day: 4, total: 30, isAnnouncement: false }, formatCta: true });
    expect(task).toMatchObject({ seriesDay: 4, seriesTotal: 30, isAnnouncement: false });
    expect((task.cta as { ctaTargets: string[] }).ctaTargets).toContain("checkin");
    expect(expertChainTask({ formatReply: "continuation" })).not.toHaveProperty("cta");
  });

  it("призыв дописывает код один раз; пост без ссылки; без признака ничего не добавляется", () => {
    const draft = { text: "Если бы ко мне пришла девушка...", replyText: "Первое: спроси. Таро потом.", ctaTarget: "tarot" };
    const withCta = replyWithCta(draft, { formatCta: true });
    expect(withCta).toMatch(/products\/tarot\?utm_source=threads&utm_medium=social&utm_campaign=expert-chain&utm_content=tarot$/);
    expect(draft.text).not.toMatch(/https?:/);
    expect(replyWithCta(draft, { formatCta: false })).toBe("Первое: спроси. Таро потом.");
    expect(replyWithCta({ ...draft, ctaTarget: "https://x.example" }, { formatCta: true })).toMatch(/products\/tarot/);
    expect(replyWithCta({ ...draft, replyText: "" }, { formatCta: true })).toBe("");
  });
});

import { repairPublishableDraft } from "@/lib/marketing/agent";

describe("B776 HIGH-3: адреса модели в Threads-материале", () => {
  const draft = {
    title: "t", text: "Пост про расклад, глянь www.fake.ru/x и eterapy.com/library/a", audienceNeed: "x", goal: "x",
    disclosure: "", cta: "", mediaBrief: "", replyText: "Часть. Ссылка https://fake.example/z здесь.", researchUsed: [], safetyFlags: [],
  };
  it("пост и продолжение слота без призыва очищаются от адресов", () => {
    const result = repairPublishableDraft({
      draft, isConversational: false, destinationUrl: null, platform: "threads", topic: "t", finalRound: true,
      format: { link: false, reply: "continuation", media: "none" },
    } as never);
    expect(result.draft.text).not.toMatch(/fake|eterapy\.com|library/);
    expect(result.draft.replyText).not.toMatch(/https?:|fake/);
    expect(replyWithCta({ ...result.draft, replyText: "Раз https://x.example два" }, { formatCta: false })).not.toMatch(/https?:/);
  });
});
