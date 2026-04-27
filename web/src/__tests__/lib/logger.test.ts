import { log, redactForLog, serializeError } from "@/lib/logger";

describe("structured logger", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalEnv,
      configurable: true,
    });
  });

  it("redacts sensitive fields recursively", () => {
    expect(
      redactForLog({
        requestId: "req-123",
        authorization: "Bearer secret",
        nested: {
          email: "person@example.com",
          prompt: "raw prompt",
          safe: "visible",
        },
      })
    ).toEqual({
      requestId: "req-123",
      authorization: "[REDACTED]",
      nested: {
        email: "[REDACTED]",
        prompt: "[REDACTED]",
        safe: "visible",
      },
    });
  });

  it("writes parseable JSON log lines", () => {
    const info = jest.spyOn(console, "info").mockImplementation(() => {});

    log.info("test-event", {
      requestId: "req-123",
      userId: "user-123",
      token: "secret-token",
    });

    expect(info).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(info.mock.calls[0][0]));

    expect(payload).toMatchObject({
      level: "info",
      event: "test-event",
      requestId: "req-123",
      userId: "user-123",
      token: "[REDACTED]",
    });
    expect(typeof payload.ts).toBe("string");
  });

  it("serializes errors without stack traces in production", () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
    });

    const error = new Error("database unavailable");
    expect(serializeError(error)).toEqual({
      name: "Error",
      message: "database unavailable",
    });
  });
});
