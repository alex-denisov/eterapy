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

describe("B756 · Threads discovery не возвращает наши посты", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; marketingPlatformValue.mockReset(); });

  it("посты собственного аккаунта отсекаются", async () => {
    marketingPlatformValue.mockResolvedValue("threads-mock-token");
    const long = "Достаточно длинный пост про матрицу судьбы и таро, который содержит более шестидесяти символов текста.";
    global.fetch = jest.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("/me")) return { ok: true, json: async () => ({ username: "Eterapy_Official" }) } as Response;
      return {
        ok: true,
        json: async () => ({
          data: [
            { id: "1", text: long, permalink: "https://threads.net/@eterapy_official/post/1", username: "eterapy_official" },
            { id: "2", text: long, permalink: "https://threads.net/@other/post/2", username: "other" },
          ],
        }),
      } as Response;
    }) as unknown as typeof fetch;
    const result = await discoveryTestables.discoverThreads();
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((candidate) => candidate.targetId === "2")).toBe(true);
  });
});
