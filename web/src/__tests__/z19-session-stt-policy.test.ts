import { getDefaultAIRoutingPolicy } from "@/lib/ai-gateway/task-policy";

describe("Z19 session STT AI gateway policy", () => {
  it("registers session-stt as a bounded speech task", () => {
    const policy = getDefaultAIRoutingPolicy("session-stt");

    expect(policy).toEqual(expect.objectContaining({
      feature: "session-stt",
      enabled: true,
      tier: "speech",
      title: expect.stringContaining("Server STT"),
      maxTokens: expect.any(Number),
      temperature: 0,
    }));
    expect(policy?.maxTokens).toBeLessThanOrEqual(1200);
    expect(policy?.perUserDailyTokenBudget).toBeLessThanOrEqual(4000);
  });
});
