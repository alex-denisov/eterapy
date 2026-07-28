import {
  MARKETING_AGENT_SYSTEM_PROMPT,
  MARKETING_REVIEWER_SYSTEM_PROMPT,
} from "@/lib/marketing/agent-prompt";
import { marketingConnectorStates, redactExternalExcerpt } from "@/lib/marketing/discovery";
import { getDefaultAIRoutingPolicy } from "@/lib/ai-gateway/task-policy";

describe("B610 · SMM-agent safety and routing contract", () => {
  it("writer and reviewer use distinct model defaults", () => {
    const writer = getDefaultAIRoutingPolicy("marketing-agent-writer");
    const reviewer = getDefaultAIRoutingPolicy("marketing-agent-reviewer");
    expect(writer).not.toBeNull();
    expect(reviewer).not.toBeNull();
    expect(writer!.modelPreferences).not.toEqual(reviewer!.modelPreferences);
  });

  it("comment premoderation and affiliation are non-negotiable prompt rules", () => {
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("Telegram-премодерация");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("я из команды ETerapy");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("Не собирай и не повторяй");
    expect(MARKETING_REVIEWER_SYSTEM_PROMPT).toContain("не может разрешить автопубликацию");
  });

  it("external excerpt redacts direct contact identifiers", () => {
    const text = redactExternalExcerpt("Пишите @alex, +7 (999) 123-45-67 или me@example.com https://example.com");
    expect(text).not.toContain("@alex");
    expect(text).not.toContain("999");
    expect(text).not.toContain("me@example.com");
    expect(text).not.toContain("https://example.com");
  });

  it("missing credentials produce an honest connector state", () => {
    const states = marketingConnectorStates();
    expect(states.map((state) => state.platform)).toEqual(["VK", "Reddit", "Threads", "Instagram", "Telegram"]);
    expect(states.find((state) => state.platform === "Threads")?.discovery).toBe(false);
    expect(states.find((state) => state.platform === "Instagram")?.comments).toBe(false);
    expect(states.find((state) => state.platform === "Instagram")?.note).toContain(
      "не даёт публиковать рекламные комментарии",
    );
  });
});
