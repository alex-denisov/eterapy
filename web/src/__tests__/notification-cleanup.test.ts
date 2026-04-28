import { readFileSync } from "fs";
import path from "path";
import { emitPayoutScheduled } from "@/lib/payout-notifications";
import { notify } from "@/lib/notifications";
import db from "@/lib/db";

jest.mock("@/lib/notifications", () => ({
  __esModule: true,
  notify: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    user: { findMany: jest.fn() },
  },
}));

const mockNotify = notify as jest.MockedFunction<typeof notify>;

describe("notification legacy cleanup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("routes payout scheduled notifications through the durable notification pipeline", async () => {
    (db.user.findMany as jest.Mock).mockResolvedValue([{ id: "admin-1" }, { id: "admin-2" }]);
    mockNotify.mockResolvedValue(undefined);

    await emitPayoutScheduled({
      date: new Date("2026-04-28T10:00:00.000Z"),
      totalRub: 15000,
      practitionerCount: 3,
    });

    expect(mockNotify).toHaveBeenCalledTimes(2);
    expect(mockNotify).toHaveBeenCalledWith({
      userId: "admin-1",
      event: "PAYOUT_SCHEDULED",
      data: {
        date: "2026-04-28T10:00:00.000Z",
        totalRub: "15000",
        practitionerCount: "3",
      },
    });
  });

  it("does not keep legacy notification console/TODO stubs in payout notifications", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/payout-notifications.ts"),
      "utf8",
    );

    expect(source).not.toContain("console.info");
    expect(source).not.toContain("TODO: wire EMAIL");
    expect(source).not.toContain("[PAYOUT_SCHEDULED] queue");
  });
});
