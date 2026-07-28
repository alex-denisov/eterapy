import {
  MARKETING_AGENT_SYSTEM_PROMPT,
  MARKETING_REVIEWER_SYSTEM_PROMPT,
} from "@/lib/marketing/agent-prompt";
import { marketingConnectorStates, normalizePublicPostExcerpt } from "@/lib/marketing/discovery";
import { getDefaultAIRoutingPolicy } from "@/lib/ai-gateway/task-policy";
import { AIProvider } from "@prisma/client";
import {
  MARKETING_ACTIVE_PROVIDERS,
  marketingProviderOrder,
} from "@/lib/marketing/model-pool";

describe("B610 · SMM-agent safety and routing contract", () => {
  it("writer and reviewer use the foreign free pool without Yandex", () => {
    const writer = getDefaultAIRoutingPolicy("marketing-agent-writer");
    const reviewer = getDefaultAIRoutingPolicy("marketing-agent-reviewer");
    expect(writer).not.toBeNull();
    expect(reviewer).not.toBeNull();
    expect(writer!.providerOrder).toEqual(expect.arrayContaining([...MARKETING_ACTIVE_PROVIDERS]));
    expect(reviewer!.providerOrder).toEqual(expect.arrayContaining([...MARKETING_ACTIVE_PROVIDERS]));
    expect(writer!.providerOrder).not.toContain(AIProvider.YANDEX);
    expect(reviewer!.providerOrder).not.toContain(AIProvider.YANDEX);
  });

  it("rotates providers and excludes writer from independent review", () => {
    const writerOrder = marketingProviderOrder("publication-42");
    const reviewerOrder = marketingProviderOrder("publication-42:review", [writerOrder[0]]);
    expect(writerOrder).toHaveLength(MARKETING_ACTIVE_PROVIDERS.length);
    expect(reviewerOrder).toHaveLength(MARKETING_ACTIVE_PROVIDERS.length - 1);
    expect(reviewerOrder).not.toContain(writerOrder[0]);
  });

  it("comment premoderation and affiliation are non-negotiable prompt rules", () => {
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("Telegram-премодерация");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("я из команды ETerapy");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("переданный публичный пост");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("внутренние данные клиентов или практиков ETerapy");
    expect(MARKETING_REVIEWER_SYSTEM_PROMPT).toContain("не может разрешить автопубликацию");
  });

  it("passes public social post context to the writer without ETerapy-specific redaction", () => {
    const text = normalizePublicPostExcerpt("Автор @alex пишет:\n\nМне сложно принять решение.");
    expect(text).toBe("Автор @alex пишет: Мне сложно принять решение.");
    expect(text).toContain("@alex");
  });

  it("missing credentials produce an honest connector state", async () => {
    const states = await marketingConnectorStates();
    expect(states.map((state) => state.platform)).toEqual(["VK", "Reddit", "Threads", "Instagram", "Telegram", "Dzen"]);
    expect(states.find((state) => state.platform === "Threads")?.discovery).toBe(false);
    expect(states.find((state) => state.platform === "Instagram")?.comments).toBe(false);
    expect(states.find((state) => state.platform === "Instagram")?.note).toContain(
      "не даёт публиковать рекламные комментарии",
    );
  });
});
