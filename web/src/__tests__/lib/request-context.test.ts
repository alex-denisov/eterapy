import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  applyRequestContextHeaders,
  getCorrelationId,
  getOrCreateRequestId,
  normalizeRequestId,
  requestContextFromHeaders,
} from "@/lib/request-context";

describe("request context", () => {
  it("accepts safe incoming request ids", () => {
    expect(normalizeRequestId("req-12345678")).toBe("req-12345678");
    expect(normalizeRequestId("  req-12345678  ")).toBe("req-12345678");
  });

  it("rejects unsafe incoming request ids", () => {
    expect(normalizeRequestId("short")).toBeNull();
    expect(normalizeRequestId("bad id with spaces")).toBeNull();
    expect(normalizeRequestId("bad/header")).toBeNull();
  });

  it("creates request and correlation ids from headers", () => {
    const headers = new Headers({
      [REQUEST_ID_HEADER]: "req-12345678",
      [CORRELATION_ID_HEADER]: "corr-12345678",
    });

    expect(getOrCreateRequestId(headers)).toBe("req-12345678");
    expect(getCorrelationId(headers, "req-12345678")).toBe("corr-12345678");
    expect(requestContextFromHeaders(headers)).toEqual({
      requestId: "req-12345678",
      correlationId: "corr-12345678",
    });
  });

  it("applies request context headers", () => {
    const headers = new Headers();
    applyRequestContextHeaders(headers, {
      requestId: "req-12345678",
      correlationId: "corr-12345678",
    });

    expect(headers.get(REQUEST_ID_HEADER)).toBe("req-12345678");
    expect(headers.get(CORRELATION_ID_HEADER)).toBe("corr-12345678");
  });
});
