import db from "@/lib/db";
import { promoteWaitlistForReleasedSlot } from "@/lib/priority-booking";

jest.mock("@/lib/db", () => {
  const tx = {
    timeSlot: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    bookingWaitlistEntry: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    booking: {
      create: jest.fn(),
    },
  };
  return {
    __esModule: true,
    default: {
      $transaction: jest.fn(async (fn: (txArg: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  };
});

const mockDb = db as typeof db & {
  __tx: {
    timeSlot: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    bookingWaitlistEntry: { findMany: jest.Mock; update: jest.Mock };
    booking: { create: jest.Mock };
  };
};

describe("Z20 waitlist promotion helper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates a fresh reserved TimeSlot for the promoted booking", async () => {
    const oldSlot = {
      id: "slot-old",
      practitionerId: "prac-1",
      startAt: new Date("2026-06-08T12:00:00.000Z"),
      endAt: new Date("2026-06-08T13:00:00.000Z"),
      visibleFrom: new Date("2026-06-07T12:00:00.000Z"),
      earlyAccessFrom: new Date("2026-06-06T12:00:00.000Z"),
      practitioner: { pricePerSession: 3000 },
    };
    mockDb.__tx.timeSlot.findUnique.mockResolvedValue(oldSlot);
    mockDb.__tx.bookingWaitlistEntry.findMany.mockResolvedValue([{
      id: "wait-premium",
      clientId: "client-premium",
      status: "ACTIVE",
      priority: 100,
      createdAt: new Date("2026-06-06T10:00:00.000Z"),
    }]);
    mockDb.__tx.timeSlot.create.mockResolvedValue({ id: "slot-promoted" });
    mockDb.__tx.booking.create.mockResolvedValue({ id: "booking-promoted" });
    mockDb.__tx.bookingWaitlistEntry.update.mockResolvedValue({});
    mockDb.__tx.timeSlot.update.mockResolvedValue({});

    const result = await promoteWaitlistForReleasedSlot({ slotId: "slot-old" });

    expect(result.status).toBe("promoted");
    expect(mockDb.__tx.timeSlot.create).toHaveBeenCalledWith({
      data: {
        practitionerId: "prac-1",
        startAt: oldSlot.startAt,
        endAt: oldSlot.endAt,
        available: false,
        visibleFrom: oldSlot.visibleFrom,
        earlyAccessFrom: oldSlot.earlyAccessFrom,
      },
    });
    expect(mockDb.__tx.booking.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        slotId: "slot-promoted",
        priority: 100,
      }),
    }));
    expect(mockDb.__tx.timeSlot.update).toHaveBeenCalledWith({
      where: { id: "slot-old" },
      data: { available: false },
    });
  });
});
