import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { GET as getBookings, PATCH as patchBookings } from "@/app/api/bookings/route";
import { PATCH as patchBookingById } from "@/app/api/bookings/[id]/route";
import { DELETE as deleteSlot } from "@/app/api/slots/[id]/route";
import { DELETE as deleteBillingCard } from "@/app/api/billing/cards/route";
import { GET as getFiles } from "@/app/api/files/route";
import { GET as getHistoryById, DELETE as deleteHistoryById } from "@/app/api/modalities/history/[id]/route";
import { DELETE as deleteNotification } from "@/app/api/notifications/route";

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    booking: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    practitioner: {
      findUnique: jest.fn(),
    },
    timeSlot: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    savedCard: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    storedFile: {
      findMany: jest.fn(),
    },
    aISessionLog: {
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
    notification: {
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/email", () => ({
  __esModule: true,
  sendBookingRequestedClient: jest.fn(),
  sendBookingRequestedPractitioner: jest.fn(),
  sendBookingConfirmedClient: jest.fn(),
  sendBookingConfirmedPractitioner: jest.fn(),
  sendBookingCancelledClient: jest.fn(),
  sendBookingCancelledPractitioner: jest.fn(),
  sendReviewRequestClient: jest.fn(),
}));

jest.mock("@/lib/notifications", () => ({
  __esModule: true,
  notify: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/platform-settings", () => ({
  __esModule: true,
  getSetting: jest.fn(),
}));

jest.mock("@/lib/session-charge", () => ({
  __esModule: true,
  chargeClientForSession: jest.fn(),
}));

jest.mock("@/lib/session-complete", () => ({
  __esModule: true,
  completeBookingAtSessionEnd: jest.fn(),
}));

jest.mock("@/lib/yukassa", () => ({
  __esModule: true,
  deleteSavedPaymentMethod: jest.fn(),
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDb = db as jest.Mocked<typeof db>;

function session(userId = "user-attacker", role = "CLIENT") {
  mockAuth.mockResolvedValue({
    user: { id: userId, role },
    expires: "2026-04-28T00:00:00.000Z",
  });
}

function request(url: string, method = "GET", body?: unknown) {
  return {
    url,
    method,
    nextUrl: new URL(url),
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body ?? {},
  } as unknown as NextRequest;
}

function bookingFixture() {
  return {
    id: "booking-victim",
    clientId: "user-victim",
    practitionerId: "prac-victim",
    status: "PENDING",
    slotId: "slot-victim",
    priceRub: 1000,
    slot: null,
    client: { name: "Victim", email: "victim@example.com" },
    practitioner: {
      id: "prac-victim",
      userId: "practitioner-victim",
      user: { name: "Practitioner", email: "practitioner@example.com" },
    },
  };
}

describe("IDOR guards for private entities", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    session();
  });

  it("does not let a client list another client's bookings through userId query params", async () => {
    mockDb.booking.findMany.mockResolvedValue([]);

    const response = await getBookings(request("https://app.eterapy.com/api/bookings?userId=user-victim"));

    expect(response.status).toBe(200);
    expect(mockDb.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { clientId: "user-attacker" },
    }));
  });

  it("blocks non-owners from updating bookings through the collection endpoint", async () => {
    mockDb.booking.findUnique.mockResolvedValue(bookingFixture());

    const response = await patchBookings(request("https://app.eterapy.com/api/bookings", "PATCH", {
      bookingId: "booking-victim",
      status: "CANCELLED",
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Нет доступа");
    expect(mockDb.booking.update).not.toHaveBeenCalled();
  });

  it("blocks non-owners from updating bookings through the item endpoint", async () => {
    mockDb.booking.findUnique.mockResolvedValue(bookingFixture());

    const response = await patchBookingById(
      request("https://app.eterapy.com/api/bookings/booking-victim", "PATCH", { status: "CANCELLED" }),
      { params: Promise.resolve({ id: "booking-victim" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Нет доступа");
    expect(mockDb.booking.update).not.toHaveBeenCalled();
  });

  it("scopes billing card deletion by current user before touching provider or DB delete", async () => {
    mockDb.savedCard.findFirst.mockResolvedValue(null);

    const response = await deleteBillingCard(request("https://app.eterapy.com/api/billing/cards?cardId=card-victim", "DELETE"));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe("CARD_NOT_FOUND");
    expect(mockDb.savedCard.findFirst).toHaveBeenCalledWith({
      where: { id: "card-victim", userId: "user-attacker" },
    });
    expect(mockDb.savedCard.delete).not.toHaveBeenCalled();
  });

  it("lists stored files only for the current user", async () => {
    mockDb.storedFile.findMany.mockResolvedValue([]);

    const response = await getFiles(request("https://app.eterapy.com/api/files?kind=REPORT"));

    expect(response.status).toBe(200);
    expect(mockDb.storedFile.findMany).toHaveBeenCalledWith({
      where: { userId: "user-attacker", kind: "REPORT" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });

  it("scopes AI history reads and deletes by current user", async () => {
    mockDb.aISessionLog.findFirst.mockResolvedValue(null);
    mockDb.aISessionLog.deleteMany.mockResolvedValue({ count: 0 });

    const getResponse = await getHistoryById(
      request("https://app.eterapy.com/api/modalities/history/log-victim"),
      { params: Promise.resolve({ id: "log-victim" }) },
    );
    const deleteResponse = await deleteHistoryById(
      request("https://app.eterapy.com/api/modalities/history/log-victim", "DELETE"),
      { params: Promise.resolve({ id: "log-victim" }) },
    );

    expect(getResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(200);
    expect(mockDb.aISessionLog.findFirst).toHaveBeenCalledWith({
      where: { id: "log-victim", userId: "user-attacker" },
    });
    expect(mockDb.aISessionLog.deleteMany).toHaveBeenCalledWith({
      where: { id: "log-victim", userId: "user-attacker" },
    });
  });

  it("deletes only current-user notifications", async () => {
    mockDb.notification.deleteMany.mockResolvedValue({ count: 0 });

    const response = await deleteNotification(request("https://app.eterapy.com/api/notifications", "DELETE", {
      id: "notification-victim",
    }));

    expect(response.status).toBe(200);
    expect(mockDb.notification.deleteMany).toHaveBeenCalledWith({
      where: { id: "notification-victim", userId: "user-attacker" },
    });
  });

  it("blocks a practitioner from deleting another practitioner's slot", async () => {
    session("practitioner-attacker", "PRACTITIONER");
    mockDb.practitioner.findUnique.mockResolvedValue({ id: "prac-attacker" });
    mockDb.timeSlot.findUnique.mockResolvedValue({
      id: "slot-victim",
      practitionerId: "prac-victim",
      available: true,
    });

    const response = await deleteSlot(
      request("https://app.eterapy.com/api/slots/slot-victim", "DELETE"),
      { params: Promise.resolve({ id: "slot-victim" }) },
    );

    expect(response.status).toBe(404);
    expect(mockDb.timeSlot.delete).not.toHaveBeenCalled();
  });
});
