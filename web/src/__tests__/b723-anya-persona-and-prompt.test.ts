import {
  MARKETING_AGENT_SYSTEM_PROMPT,
  marketingWriterSystemPrompt,
} from "@/lib/marketing/agent-prompt";
import { marketingRole } from "@/lib/marketing/agent-roles";
import { buildMarketingResearchBrief } from "@/lib/marketing/research";

describe("B723: Anya Persona, Few-Shot Hooks, Token Optimization & Anti-Slop", () => {
  it("роль автора названа от лица Ани, куратора eTerapy", () => {
    const role = marketingRole("writer");
    expect(role.title).toContain("Аня");
    expect(role.title).toContain("куратор");
    expect(role.mission).toContain("Ани");
    expect(role.mission).toContain("28–32");
  });

  it("системный промпт автора содержит живую персону Ани (редакция B759)", () => {
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("Голос и персона: Аня, eTerapy");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("28–32 года");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("кот Котлета");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("бывший Никита");
    // Прежний баланс 70/20/10 владелец отменил.
    expect(MARKETING_AGENT_SYSTEM_PROMPT).not.toContain("70 / 20 / 10");
  });

  it("формула Question-First остаётся, но отменяется форматами без пользы и призыва", () => {
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("Хук ситуации (первые 50 знаков)");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("Скрытый мотив");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("Инсайт-зеркало");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("только если формат требует пользы и призыва");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("«Ты слишком много думаешь» — написал он в 01:40");
  });

  it("системный промпт включает строгие правила Anti-Slop (Conor Bronsdon)", () => {
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("«в современном мире»");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("«давайте разберёмся»");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("«не просто X, а Y»");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("Запрещённая механическая симметрия");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("списки ровно из трёх пунктов с одинаковыми эмодзи");
  });

  it("площадочный промпт корректно склеивается для Telegram, Threads, VK", () => {
    for (const platform of ["telegram", "threads", "vk"]) {
      const prompt = marketingWriterSystemPrompt(platform);
      expect(prompt.startsWith(MARKETING_AGENT_SYSTEM_PROMPT)).toBe(true);
      expect(prompt).toContain(`КОНТРАКТ ТВОЕЙ ПЛОЩАДКИ — ${platform}`);
    }
  });

  it("исследовательский бриф сжат: новости до 200 символов, прошлые посты до 5 штук и 100 символов", async () => {
    const mockPublication = {
      id: "test-pub-1",
      platform: "telegram",
      title: "Как понять, что в отношениях наступил тупик",
      targetQuery: "отношения тупик",
      cluster: "отношения",
      scheduledFor: new Date("2026-09-07T10:00:00Z"),
      engagementExcerpt: null,
      engagementTargetUrl: null,
    };

    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss><channel>
  <item>
    <title>Длинный заголовок новости из RSS ленты</title>
    <link>https://example.com/news/1</link>
    <description>${"Слишком длинный текст описания новости ".repeat(20)}</description>
    <pubDate>Mon, 07 Sep 2026 08:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => mockXml,
    })) as unknown as typeof fetch;

    const brief = await buildMarketingResearchBrief(mockPublication, {
      fetchImpl,
      now: new Date("2026-09-07T08:30:00Z"),
    });

    expect(brief.currentSignals.length).toBeLessThanOrEqual(6);
    if (brief.currentSignals[0]) {
      expect(brief.currentSignals[0].excerpt.length).toBeLessThanOrEqual(200);
      expect(brief.currentSignals[0].title.length).toBeLessThanOrEqual(120);
    }
    expect(brief.recentOwnMaterials.length).toBeLessThanOrEqual(5);
    for (const item of brief.recentOwnMaterials) {
      expect(item.bodyExcerpt.length).toBeLessThanOrEqual(100);
    }
  });
});
