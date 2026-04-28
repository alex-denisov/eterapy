describe("Telegram runtime diagnostics", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("reports relay host without exposing the bot token", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123456:secret-token";
    process.env.TELEGRAM_API_BASE = "https://tg-relay.example.com/bot123456:secret-token";

    const { getTelegramRuntimeConfig } = await import("@/lib/telegram");

    expect(getTelegramRuntimeConfig()).toEqual({
      configured: true,
      apiBaseHost: "tg-relay.example.com",
      usingRelay: true,
    });
    expect(JSON.stringify(getTelegramRuntimeConfig())).not.toContain("secret-token");
  });

  it("reports direct Telegram API mode when no relay base is configured", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123456:secret-token";
    delete process.env.TELEGRAM_API_BASE;

    const { getTelegramRuntimeConfig } = await import("@/lib/telegram");

    expect(getTelegramRuntimeConfig()).toEqual({
      configured: true,
      apiBaseHost: "api.telegram.org",
      usingRelay: false,
    });
  });
});
