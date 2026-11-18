import { mergeAIPromptOverride } from "@/lib/ai-gateway/prompts";
import { marketingWriterSystemPrompt } from "@/lib/marketing/agent-prompt";
import { heroRuleFor } from "@/lib/marketing/threads-clusters";
import { nicheFindings } from "@/lib/marketing/threads-niche";
import { FOUNDER_PRODUCT_FORMAT, usefulFormatForWeekday } from "@/lib/marketing/threads-useful-formats";

test("legacy admin prompt cannot erase the current Threads author instructions", () => {
  const runtime = marketingWriterSystemPrompt("threads");
  const old = "Legacy administrator custom instructions without template";
  const merged = mergeAIPromptOverride("marketing-agent-writer", runtime, old);
  expect(merged).toContain(old);
  expect(merged).toContain("достоверный личный опыт используй только если он явно передан");
  expect(merged.indexOf(old)).toBeLessThan(merged.indexOf("достоверный личный опыт используй"));
});

test("fictional heroes are not required to be named or passed off as personal history", () => {
  for (const kind of ["core", "boss", "friend", "client"] as const) {
    const rule = heroRuleFor(kind, 123, 2);
    expect(rule).toMatch(/условн/i);
    expect(rule).not.toMatch(/Подруга поста —|друг —|форму имени можно менять/);
  }
});

test("founder introduction has several weekly opportunities", () => {
  expect([2, 4, 6].map(usefulFormatForWeekday)).toEqual(Array(3).fill(FOUNDER_PRODUCT_FORMAT));
});

test("an approved relationship scenario is not rejected for lacking jargon or astrology", () => {
  expect(nicheFindings("Он ответил «понятно». Перечитываю сообщение и думаю, что наши отношения закончились.")).toEqual([]);
});
