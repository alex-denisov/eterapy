import type { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";
import db from "@/lib/db";
import {
  grantWelcomeCredits,
  WELCOME_CREDIT_AMOUNT,
} from "@/lib/welcome-credits";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(),
    analyticsEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

const mockDb = db as jest.Mocked<typeof db>;
const root = process.cwd();

function request(headers: Record<string, string> = {}) {
  return new Request("https://eterapy.com/api/auth/verify-email", {
    method: "POST",
    headers,
  }) as NextRequest;
}

function createTx(overrides: {
  existingGrant?: number;
  deviceGrantCount?: number;
} = {}) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    clarityCreditLedgerEntry: {
      count: jest.fn()
        .mockResolvedValueOnce(overrides.existingGrant ?? 0)
        .mockResolvedValueOnce(overrides.deviceGrantCount ?? 0),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: "credit-1", balanceAfter: WELCOME_CREDIT_AMOUNT }),
    },
    fraudEvent: {
      create: jest.fn().mockResolvedValue({ id: "fraud-1" }),
    },
  };
  return tx;
}

describe("Y10 Z5 welcome credits", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("grants 3 confirmed welcome credits for 14 days with an idempotent source event", async () => {
    const tx = createTx();
    (mockDb.$transaction as jest.Mock).mockImplementationOnce((callback) => callback(tx));
    const now = new Date("2026-06-05T10:00:00.000Z");

    const result = await grantWelcomeCredits({
      request: request({
        "x-forwarded-for": "203.0.113.7",
        "user-agent": "Welcome Test Browser",
        "x-eterapy-device-id": "device-1",
      }),
      userId: "user-1",
      now,
    });

    expect(result).toEqual({ status: "granted", amount: 3 });
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.clarityCreditLedgerEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user-1",
        amount: 3,
        type: "grant",
        source: "welcome",
        sourceEventId: "welcome:user-1",
        status: "confirmed",
        expiresAt: new Date("2026-06-19T10:00:00.000Z"),
      }),
    }));
    expect(tx.fraudEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        subjectType: "welcome_credit",
        actorUserId: "user-1",
        action: "welcome_credit_granted",
        status: "logged",
      }),
    }));
  });

  it("does not duplicate the welcome grant for the same account", async () => {
    const tx = createTx({ existingGrant: 1 });
    (mockDb.$transaction as jest.Mock).mockImplementationOnce((callback) => callback(tx));

    const result = await grantWelcomeCredits({
      request: request({ "x-eterapy-device-id": "device-1" }),
      userId: "user-1",
      now: new Date("2026-06-05T10:00:00.000Z"),
    });

    expect(result).toEqual({ status: "already_granted", amount: 0 });
    expect(tx.clarityCreditLedgerEntry.create).not.toHaveBeenCalled();
    expect(tx.fraudEvent.create).not.toHaveBeenCalled();
  });

  it("blocks a second account on the same device within 30 days", async () => {
    const tx = createTx({ deviceGrantCount: 1 });
    (mockDb.$transaction as jest.Mock).mockImplementationOnce((callback) => callback(tx));

    const result = await grantWelcomeCredits({
      request: request({ "x-eterapy-device-id": "device-1" }),
      userId: "user-2",
      now: new Date("2026-06-05T10:00:00.000Z"),
    });

    expect(result).toEqual({ status: "blocked", amount: 0, reason: "duplicate_device_30d" });
    expect(tx.clarityCreditLedgerEntry.create).not.toHaveBeenCalled();
    expect(tx.fraudEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: "welcome_credit_blocked",
        status: "blocked",
        riskFlags: ["duplicate_welcome_device_30d"],
      }),
    }));
  });

  it("surfaces a cabinet card that guides welcome credits to 4 reframe", () => {
    const page = fs.readFileSync(path.join(root, "src/app/cabinet/wallet/page.tsx"), "utf8");

    expect(page).toContain("welcome-credits-card");
    expect(page).toContain("welcome_credits_open_reframe_clicked");
    expect(page).toContain("/products/reframe");
  });
});
