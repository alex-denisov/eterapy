/** B761 — команды «идея»/«комментарий», премодерация, причина отказа, метрика качества. */
jest.mock("@/lib/db", () => ({ __esModule: true, default: {} }));

import { parseOwnerCommand, parseOwnerIdeas } from "@/lib/marketing/owner-ideas";
import { parseCommentDraft } from "@/lib/marketing/owner-comment";
import { parseRevisionDecision } from "@/lib/marketing/owner-review";
import { isOwnerReviewed, summarizeOwnerReview, type OwnerReviewLogEntry } from "@/lib/marketing/owner-review-state";

describe("parseOwnerCommand", () => {
  it.each([
    "идея: пост про Тельцов и деньги",
    "Идея: пост про Тельцов и деньги",
    
    "ИДЕЯ - пост про Тельцов и деньги",
    "идея https://www.threads.com/share/abc123",
  ])("%s — идея", (text) => {
    expect(parseOwnerCommand(text)?.kind).toBe("idea");
  });

  it.each([
    "комментарий: https://www.threads.com/share/abc123",
    "Комментарий https://www.threads.com/share/abc123",
    "коммент https://www.threads.com/share/abc123",
    "Коммент: https://www.threads.com/share/abc123",
  ])("%s — комментарий", (text) => {
    expect(parseOwnerCommand(text)?.kind).toBe("comment");
  });

  it("слова-ловушки командой не являются", () => {
    expect(parseOwnerCommand("идеальный пост получился, спасибо")).toBeNull();
    expect(parseOwnerCommand("комментировать не буду, это перебор")).toBeNull();
    expect(parseOwnerCommand("хорошая идея: пост про Тельцов")).toBeNull();
  });

  it("список идей делится, комментарий остаётся одним заданием", () => {
    expect(parseOwnerIdeas("идея:\n1. пост про бывших и их странные привычки\n2. пост про сестру Катю и её советы")).toHaveLength(2);
    expect(parseOwnerCommand("комментарий https://threads.com/share/x\nшутливо, без мата")?.items).toHaveLength(1);
  });
});

describe("parseCommentDraft", () => {
  it("один текст ≤280 без ссылок", () => {
    expect(parseCommentDraft('{"comment":"Знакомо до боли","cluster":"бывшие","technique":"узнавание"}'))
      .toEqual({ text: "Знакомо до боли", cluster: "бывшие", technique: "узнавание" });
    expect(parseCommentDraft('{"comment":"смотри https://eterapy.com"}')).toBeNull();
    expect(parseCommentDraft(`{"comment":"${"я".repeat(281)}"}`)).toBeNull();
    expect(parseCommentDraft("не json")).toBeNull();
  });
});

describe("parseRevisionDecision", () => {
  it("берёт решение агента: patch или rewrite", () => {
    expect(parseRevisionDecision('{"mode":"patch","instructions":"смени концовку"}', "концовка слабая").mode).toBe("patch");
    expect(parseRevisionDecision('{"mode":"rewrite","instructions":"другой герой"}', "не про бывшего").mode).toBe("rewrite");
  });
  it("на мусоре безопасно переписывает целиком с причиной как есть", () => {
    expect(parseRevisionDecision("ой", "слишком грубо")).toEqual({ mode: "rewrite", instructions: "слишком грубо" });
  });
});

describe("премодерация владельца", () => {
  it("касается идей-постов и комментариев, но не плановых постов", () => {
    expect(isOwnerReviewed({ contentType: "POST", source: "OWNER_IDEA" })).toBe(true);
    expect(isOwnerReviewed({ contentType: "OWNER_COMMENT", source: "OWNER_COMMENT" })).toBe(true);
    expect(isOwnerReviewed({ contentType: "POST", source: "ADMIN_UI" })).toBe(false);
    expect(isOwnerReviewed({ contentType: "INBOUND_REPLY", source: "OWNER_IDEA" })).toBe(false);
  });
});

describe("метрика качества агента", () => {
  const now = new Date("2026-10-12T10:00:00Z");
  const entry = (action: OwnerReviewLogEntry["action"], kind: OwnerReviewLogEntry["kind"], daysAgo = 1): OwnerReviewLogEntry => ({
    at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
    publicationId: "p", kind, action, cluster: null, technique: null, reason: action === "reject" ? "грубо" : null,
  });
  it("доля «Принять» среди решений; «Убрать» и старое не считаются", () => {
    const q = summarizeOwnerReview(
      [entry("approve", "idea"), entry("approve", "comment"), entry("reject", "comment"), entry("revise", "idea"), entry("remove", "idea"), entry("approve", "idea", 20)],
      now, 7,
    );
    expect(q.decisions).toBe(4);
    expect(q.approved).toBe(2);
    expect(q.approvalRate).toBe(0.5);
    expect(q.byKind.comment).toEqual({ decisions: 2, approved: 1 });
    expect(q.topRejectionReasons).toEqual(["грубо"]);
  });
});

describe("замечания ревью", () => {
  it("команда без разделителя нужна только со ссылкой", () => {
    expect(parseOwnerCommand("Комментарий по отчёту, слишком много постов в день")).toBeNull();
    expect(parseOwnerCommand("идея хорошая, но давайте позже подумаем")).toBeNull();
    expect(parseOwnerCommand("идея https://www.threads.com/share/abc123")?.kind).toBe("idea");
  });
});
