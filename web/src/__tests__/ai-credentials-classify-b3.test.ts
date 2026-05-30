import { classifyHealthFailureCode } from "@/lib/ai-gateway/credentials";

describe("B3 — AI credential failure classification", () => {
  it("maps out-of-credits / billing messages to INSUFFICIENT_CREDITS", () => {
    expect(classifyHealthFailureCode("Your credit balance is too low to access the API.", "X")).toBe("INSUFFICIENT_CREDITS");
    // "insufficient_quota" is billing exhaustion (you must pay), not a rate limit.
    expect(classifyHealthFailureCode("insufficient_quota: you exceeded your current quota", "X")).toBe("INSUFFICIENT_CREDITS");
    expect(classifyHealthFailureCode("Payment required", "X")).toBe("INSUFFICIENT_CREDITS");
    expect(classifyHealthFailureCode("HTTP 402", "X")).toBe("INSUFFICIENT_CREDITS");
  });

  it("maps pure rate-limit messages to QUOTA_EXCEEDED", () => {
    expect(classifyHealthFailureCode("Rate limit reached for requests", "X")).toBe("QUOTA_EXCEEDED");
    expect(classifyHealthFailureCode("429 Too Many Requests", "X")).toBe("QUOTA_EXCEEDED");
  });

  it("maps auth failures to INVALID_KEY", () => {
    expect(classifyHealthFailureCode("invalid x-api-key", "X")).toBe("INVALID_KEY");
    expect(classifyHealthFailureCode("Unauthorized", "X")).toBe("INVALID_KEY");
  });

  it("falls back for unknown messages and empty input", () => {
    expect(classifyHealthFailureCode("some random network error", "HEALTHCHECK_FAILED")).toBe("HEALTHCHECK_FAILED");
    expect(classifyHealthFailureCode(undefined, "HEALTHCHECK_FAILED")).toBe("HEALTHCHECK_FAILED");
  });
});
