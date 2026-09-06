import { discoveryTestables } from "@/lib/marketing/discovery";

jest.mock("@/lib/marketing/platform-settings", () => ({
  marketingPlatformValue: jest.fn(),
}));

const { marketingPlatformValue } = jest.requireMock("@/lib/marketing/platform-settings") as {
  marketingPlatformValue: jest.Mock;
};

describe("B719 · Threads discovery resilience", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    marketingPlatformValue.mockReset();
  });

  it("returns empty array when token is missing", async () => {
    marketingPlatformValue.mockResolvedValue(null);
    const result = await discoveryTestables.discoverThreads();
    expect(result).toEqual([]);
  });

  it("gracefully returns empty array on Meta 'An unknown error occurred' without throwing", async () => {
    marketingPlatformValue.mockResolvedValue("threads-mock-token");
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: { message: "An unknown error occurred", code: 1 },
      }),
    } as Response);

    const result = await discoveryTestables.discoverThreads();
    expect(result).toEqual([]);
  });

  it("gracefully returns empty array on network failure/timeout without throwing", async () => {
    marketingPlatformValue.mockResolvedValue("threads-mock-token");
    global.fetch = jest.fn().mockRejectedValue(new Error("Network timeout"));

    const result = await discoveryTestables.discoverThreads();
    expect(result).toEqual([]);
  });

  it("parses valid candidates when Meta returns keyword results", async () => {
    marketingPlatformValue.mockResolvedValue("threads-mock-token");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "post-123",
            text: "Это достаточно длинный пост про матрицу судьбы и таро, который содержит более 60 символов текста для проверки фильтра.",
            permalink: "https://threads.net/@user/post/post-123",
            username: "user_expert",
          },
        ],
      }),
    } as Response);

    const result = await discoveryTestables.discoverThreads();
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toEqual(expect.objectContaining({
      platform: "threads",
      targetId: "post-123",
      targetUrl: "https://threads.net/@user/post/post-123",
      targetLabel: "Threads @user_expert",
    }));
  });
});
