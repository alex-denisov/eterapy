import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { auth } from "@/lib/auth";
import { stopRecording } from "@/lib/livekit-egress";
import {
  ServerSttError,
  startServerSttForBooking,
} from "@/lib/server-stt";
import { DELETE, GET, POST } from "@/app/api/video/recording/route";

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    booking: { findUnique: jest.fn() },
    videoSession: { findFirst: jest.fn(), update: jest.fn() },
  },
}));

jest.mock("@/lib/livekit-egress", () => ({
  startRoomRecording: jest.fn(),
  stopRecording: jest.fn(),
}));

jest.mock("@/lib/server-stt", () => {
  class MockServerSttError extends Error {
    constructor(message: string, public readonly statusCode: number) {
      super(message);
      this.name = "ServerSttError";
    }
  }
  return {
    ServerSttError: MockServerSttError,
    startServerSttForBooking: jest.fn(),
  };
});

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDb = db as unknown as {
  videoSession: { findFirst: jest.Mock; update: jest.Mock };
};
const mockStartServerStt = startServerSttForBooking as jest.MockedFunction<typeof startServerSttForBooking>;
const mockStopRecording = stopRecording as jest.MockedFunction<typeof stopRecording>;

function request(method: "DELETE" | "GET" | "POST", body?: Record<string, unknown>) {
  const url = method === "GET"
    ? "https://app.eterapy.com/api/video/recording?bookingId=booking-1"
    : "https://app.eterapy.com/api/video/recording";
  const req = new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as NextRequest;
  Object.defineProperty(req, "nextUrl", { value: new URL(url) });
  return req;
}

describe("Z19 recording route server STT contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "practitioner-user", role: "PRACTITIONER" },
      expires: "2026-07-06T00:00:00.000Z",
    });
    mockStartServerStt.mockResolvedValue({
      ok: true,
      status: "queued",
      jobId: "job-stt-1",
      videoSessionId: "vs-1",
      egressId: "egress-1",
      audioExpiresAt: new Date("2026-06-06T13:00:00.000Z"),
    });
    mockDb.videoSession.update.mockResolvedValue({});
  });

  it("does not expose the legacy full-session recording path", async () => {
    const response = await POST(request("POST", { bookingId: "booking-1" }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("Полная видеозапись недоступна");
    expect(mockStartServerStt).not.toHaveBeenCalled();
  });

  it("starts server STT through the Pro+ orchestration path instead of raw MP4 recording", async () => {
    const response = await POST(request("POST", { bookingId: "booking-1", mode: "server_stt" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("queued");
    expect(mockStartServerStt).toHaveBeenCalledWith({
      bookingId: "booking-1",
      actorUserId: "practitioner-user",
      actorRole: "PRACTITIONER",
    });
  });

  it("maps server STT domain errors to their HTTP status", async () => {
    mockStartServerStt.mockRejectedValueOnce(new ServerSttError("Серверная расшифровка доступна в Practitioner Pro+", 403));

    const response = await POST(request("POST", { bookingId: "booking-1", mode: "server_stt" }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("Pro+");
  });

  it("scopes recording status to the booking participant or admin", async () => {
    mockDb.videoSession.findFirst.mockResolvedValueOnce(null);

    const response = await GET(request("GET"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Booking not found");
    expect(mockDb.videoSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        bookingId: "booking-1",
        booking: expect.objectContaining({
          OR: [
            { clientId: "practitioner-user" },
            { practitioner: { userId: "practitioner-user" } },
          ],
        }),
      }),
    }));
  });

  it("does not stop arbitrary egress ids without a scoped recording row", async () => {
    mockDb.videoSession.findFirst.mockResolvedValueOnce(null);

    const response = await DELETE(request("DELETE", { egressId: "egress-other" }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Recording not found");
    expect(mockStopRecording).not.toHaveBeenCalled();
  });

  it("stops a recording only for the scoped practitioner or admin", async () => {
    mockDb.videoSession.findFirst.mockResolvedValueOnce({
      id: "vs-1",
      booking: { practitioner: { userId: "practitioner-user" } },
    });

    const response = await DELETE(request("DELETE", { egressId: "egress-1" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockStopRecording).toHaveBeenCalledWith("egress-1");
    expect(mockDb.videoSession.update).toHaveBeenCalledWith({
      where: { id: "vs-1" },
      data: { recordingEgressId: null },
    });
  });
});
