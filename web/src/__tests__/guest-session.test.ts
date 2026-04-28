import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { aiComplete } from "@/lib/ai";
import { checkAndRecordToolSession } from "@/lib/tool-limit-server";
import {
  createGuestSessionCookieValue,
  GUEST_SESSION_COOKIE,
  readGuestSessionIdFromCookieValue,
} from "@/lib/guest-session";
import { GET as getGuestSession } from "@/app/api/guest/session/route";
import { POST as postCheckin } from "@/app/api/modalities/checkin/route";

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("@/lib/tool-limit-server", () => ({
  __esModule: true,
  checkAndRecordToolSession: jest.fn(),
}));

jest.mock("@/lib/ai", () => ({
  __esModule: true,
  aiComplete: jest.fn(),
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockCheckAndRecordToolSession = checkAndRecordToolSession as jest.MockedFunction<typeof checkAndRecordToolSession>;
const mockAiComplete = aiComplete as jest.MockedFunction<typeof aiComplete>;

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://eterapy.com${path}`, init) as NextRequest;
}

function checkinRequest(headers: HeadersInit = {}) {
  return request("/api/modalities/checkin", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      tier: "quick",
      answers: ["Работа", "Тревога", "Сделать выбор"],
    }),
  });
}

describe("guest session identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(null);
    mockCheckAndRecordToolSession.mockResolvedValue({ allowed: true, remaining: null });
    mockAiComplete.mockResolvedValue({
      text: "Гостевой первичный ответ",
      provider: "openai",
      model: "test-model",
      tokensIn: 10,
      tokensOut: 20,
      latencyMs: 30,
    });
  });

  it("creates and validates a signed guest cookie value", () => {
    const value = createGuestSessionCookieValue("gst_00000000-0000-4000-8000-000000000000");

    expect(readGuestSessionIdFromCookieValue(value)).toBe("gst_00000000-0000-4000-8000-000000000000");
    expect(readGuestSessionIdFromCookieValue(value.replace("gst_", "bad_"))).toBeNull();
    expect(readGuestSessionIdFromCookieValue(`${value}tampered`)).toBeNull();
  });

  it("exposes an endpoint that creates the anonymous identity cookie", async () => {
    const response = await getGuestSession(request("/api/guest/session"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.guestSessionId).toBeUndefined();
    expect(body.created).toBe(true);
    expect(response.headers.get("set-cookie")).toContain(GUEST_SESSION_COOKIE);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("lets a guest request a quick check-in and sets ownership cookie", async () => {
    const response = await postCheckin(checkinRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result).toBe("Гостевой первичный ответ");
    expect(response.headers.get("X-Guest-Session")).toBe("created");
    expect(response.headers.get("set-cookie")).toContain(GUEST_SESSION_COOKIE);
    expect(mockCheckAndRecordToolSession).toHaveBeenCalledWith(null, "CHECKIN", "quick");
  });

  it("reuses an existing valid guest cookie instead of rotating identity", async () => {
    const cookieValue = createGuestSessionCookieValue("gst_11111111-1111-4111-8111-111111111111");
    const response = await postCheckin(checkinRequest({
      cookie: `${GUEST_SESSION_COOKIE}=${encodeURIComponent(cookieValue)}`,
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Guest-Session")).toBe("existing");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
