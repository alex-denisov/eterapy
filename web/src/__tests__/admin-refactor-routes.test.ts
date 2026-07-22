import { TextDecoder, TextEncoder } from "util";
// B572: см. z20-booking-route — версия агентской оферты идёт из источника.
import { AGENT_OFFER_VERSION } from "@/lib/practitioner-compliance";

if (!global.TextEncoder) {
  // Prisma / Next.js server helpers expect these globals in the test runtime.
  (global as typeof globalThis & { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;
}

if (!global.TextDecoder) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).TextDecoder = TextDecoder;
}

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("next/server", () => ({
  __esModule: true,
  NextRequest: class NextRequest {},
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    practitioner: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    booking: {
      findMany: jest.fn(),
    },
    priceRate: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

async function loadModules() {
  const authModule = await import("@/lib/auth");
  const dbModule = await import("@/lib/db");
  const practitionerRoute = await import("@/app/api/admin/practitioners/route");
  const bookingsRoute = await import("@/app/api/bookings/route");
  const ratesRoute = await import("@/app/api/rates/route");

  return {
    mockAuth: authModule.auth as jest.Mock,
    mockDb: dbModule.default as unknown as {
      practitioner: {
        findMany: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
      };
      booking: {
        findMany: jest.Mock;
      };
      priceRate: {
        findMany: jest.Mock;
        upsert: jest.Mock;
      };
      $transaction: jest.Mock;
    },
    patchPractitionerStatus: practitionerRoute.PATCH as unknown as (req: { nextUrl: URL; json: () => Promise<unknown> }) => Promise<Response>,
    getBookings: bookingsRoute.GET as unknown as (req: { nextUrl: URL; json: () => Promise<unknown> }) => Promise<Response>,
    patchRates: ratesRoute.PATCH as unknown as (req: { nextUrl: URL; json: () => Promise<unknown> }) => Promise<Response>,
  };
}

function makeRequest(url: string, body?: unknown) {
  return {
    nextUrl: new URL(url),
    json: async () => body,
  };
}

describe("admin refactor routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lets SUPERADMIN approve or reject practitioners", async () => {
    const { mockAuth, mockDb, patchPractitionerStatus } = await loadModules();
    mockAuth.mockResolvedValue({ user: { id: "superadmin-1", role: "SUPERADMIN" } });
    mockDb.practitioner.findUnique.mockResolvedValue({
      id: "prac-1",
      status: "ACTIVE",
      verified: true,
      agentOfferAcceptedAt: new Date("2026-06-18T10:00:00.000Z"),
      agentOfferVersion: AGENT_OFFER_VERSION,
      taxStatus: "SELF_EMPLOYED",
      taxReviewStatus: "VERIFIED",
      taxStatusVerifiedAt: new Date("2026-06-18T10:05:00.000Z"),
      payoutDetails: { type: "CARD", inn: "123456789012", kycStatus: "NOT_REQUIRED" },
    });
    mockDb.practitioner.update.mockResolvedValue({
      id: "prac-1",
      status: "ACTIVE",
    });

    const res = await patchPractitionerStatus(makeRequest("http://localhost/api/admin/practitioners", {
      practitionerId: "prac-1",
      status: "ACTIVE",
    }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockDb.practitioner.update).toHaveBeenCalledWith({
      where: { id: "prac-1" },
      data: { status: "ACTIVE" },
    });
  });

  it("loads the selected client's bookings for admin sessions panel", async () => {
    const { mockAuth, mockDb, getBookings } = await loadModules();
    mockAuth.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mockDb.booking.findMany.mockResolvedValue([
      {
        id: "booking-1",
        status: "CONFIRMED",
        priceRub: 2500,
        createdAt: new Date("2026-04-10T10:00:00.000Z"),
        updatedAt: new Date("2026-04-10T10:05:00.000Z"),
        slot: {
          startAt: new Date("2026-04-11T12:00:00.000Z"),
          endAt: new Date("2026-04-11T13:00:00.000Z"),
        },
        practitioner: {
          id: "prac-1",
          user: { name: "Практик" },
        },
      },
    ]);

    const res = await getBookings(makeRequest("http://localhost/api/bookings?role=admin&userId=client-1"));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(mockDb.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clientId: "client-1" },
      })
    );
    expect(data.bookings).toHaveLength(1);
    expect(data.bookings[0].id).toBe("booking-1");
  });

  it("keeps canonical practitioner fields in sync when rates are bulk applied", async () => {
    const { mockAuth, mockDb, patchRates } = await loadModules();
    mockAuth.mockResolvedValue({ user: { id: "superadmin-1", role: "SUPERADMIN" } });
    mockDb.priceRate.findMany.mockResolvedValue([]);
    mockDb.priceRate.upsert.mockResolvedValue({});
    mockDb.practitioner.update.mockResolvedValue({});

    const res = await patchRates(makeRequest("http://localhost/api/rates", {
      practitionerId: "prac-1",
      rates: [
        { durationMin: 15, priceRub: 1000, enabled: false },
        { durationMin: 30, priceRub: 1500, enabled: true },
        { durationMin: 60, priceRub: 2200, enabled: true },
      ],
    }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockDb.practitioner.update).toHaveBeenCalledWith({
      where: { id: "prac-1" },
      data: {
        pricePerSession: 1500,
        sessionDuration: 30,
      },
    });
  });
});
