/**
 * B762 — копирка хука в Threads исключается кодом, а не просьбой в промте.
 *
 * Владелец 2026-10-12: «"раки, ало" не может повториться 2 раза за месяц,
 * "*знак* ало" не должен идти подряд — это выглядит как пост под копирку».
 */

import { hookCopyFindings, hookTemplate, hookText } from "@/lib/marketing/threads-hooks";

const NOW = new Date("2026-10-12T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

describe("B762 — отпечаток хука", () => {
  it("знак и «ало/алло/алё» сводятся к шаблону", () => {
    expect(hookTemplate("Раки, ало, вы живы?")).toBe(hookTemplate("Козероги, алло! вы там живы"));
    expect(hookTemplate("Водолеи — алё, готовы?")).toBe(hookTemplate("Рыбы, ало, готовы?"));
    expect(hookTemplate("Девочки, вы живы?")).not.toBe(hookTemplate("Раки, ало, вы живы?"));
  });

  it("хук — первая строка без регистра и знаков препинания", () => {
    expect(hookText("Раки, ало!\nдальше текст")).toBe(hookText("раки ало"));
  });

  it("слово, похожее на знак внутри другого слова, знаком не считается", () => {
    expect(hookTemplate("Ракета взлетела")).not.toBe(hookTemplate("Раки взлетели"));
  });
});

describe("B762 — находки копирки", () => {
  it("тот же хук за 30 суток — копирка", () => {
    const findings = hookCopyFindings({
      text: "Раки, ало. Про вас на неделю.\nЗабирайте прогноз:",
      recent: [{ text: "Раки, ало! Что будет до воскресенья.\nЗабирайте прогноз:", at: daysAgo(20) }],
      now: NOW,
    });
    expect(findings.map((finding) => finding.rule)).toContain("hook-copy-month");
  });

  it("тот же хук старше 30 суток — не копирка", () => {
    const findings = hookCopyFindings({
      text: "Раки, ало. Про вас на неделю.",
      recent: [{ text: "Раки, ало! Что будет.", at: daysAgo(31) }],
      now: NOW,
    });
    expect(findings).toEqual([]);
  });

  it("тот же шаблон, что у предыдущего поста, — копирка даже с другим знаком", () => {
    const findings = hookCopyFindings({
      text: "Козероги, алло, вы живы?",
      recent: [
        { text: "Скорпионы, ало, держитесь", at: daysAgo(0.1) },
        { text: "Девочки, кто ещё не спит", at: daysAgo(0.3) },
      ],
      now: NOW,
    });
    expect(findings.map((finding) => finding.rule)).toContain("hook-copy-in-row");
  });

  it("тот же шаблон через пост — допустим", () => {
    const findings = hookCopyFindings({
      text: "Козероги, алло, вы живы?",
      recent: [
        { text: "Девочки, кто ещё не спит", at: daysAgo(0.1) },
        { text: "Скорпионы, ало, держитесь", at: daysAgo(0.3) },
      ],
      now: NOW,
    });
    expect(findings).toEqual([]);
  });

  it("разные хуки — чисто", () => {
    expect(hookCopyFindings({
      text: "Ольга Викторовна в 18:55: «это на пять минут»",
      recent: [{ text: "Те, кому за 30: какой совет вам не дали?", at: daysAgo(1) }],
      now: NOW,
    })).toEqual([]);
  });
});
