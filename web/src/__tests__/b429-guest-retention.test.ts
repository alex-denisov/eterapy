import { claimGuestDialoguesForUser } from "@/lib/claim-guest-dialogues";
import {
  GUEST_DIALOGUE_RESIDENCY,
  GUEST_DIALOGUE_TTL_HOURS,
  buildGuestDialogueRetentionData,
  cleanupExpiredGuestDialogues,
  guestDialogueExpiresAt,
} from "@/lib/guest-dialogue-retention";
import db from "@/lib/db";
import fs from "fs";
import path from "path";

jest.mock("@/lib/db", () => {
  const dbMock: {
    user: { findUnique: jest.Mock };
    dialogue: { updateMany: jest.Mock; findMany: jest.Mock; delete: jest.Mock };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  } = {
    user: { findUnique: jest.fn() },
    dialogue: { updateMany: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  dbMock.$transaction.mockImplementation(async (fn: (tx: typeof dbMock) => unknown) => fn(dbMock));
  return { __esModule: true, default: dbMock };
});

const mockDb = db as unknown as {
  user: { findUnique: jest.Mock };
  dialogue: { updateMany: jest.Mock; findMany: jest.Mock; delete: jest.Mock };
  auditLog: { create: jest.Mock };
  $transaction: jest.Mock;
};

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("B429 guest dialogue retention", () => {
  const now = new Date("2026-06-18T10:00:00.000Z");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("marks anonymous dialogues as RU_TEMP with a 72 hour TTL", () => {
    expect(GUEST_DIALOGUE_TTL_HOURS).toBe(72);
    expect(GUEST_DIALOGUE_RESIDENCY).toBe("RU_TEMP");
    expect(guestDialogueExpiresAt(now).toISOString()).toBe("2026-06-21T10:00:00.000Z");
    expect(buildGuestDialogueRetentionData({ userId: null, now })).toEqual({
      dataResidency: "RU_TEMP",
      expiresAt: new Date("2026-06-21T10:00:00.000Z"),
    });
    expect(buildGuestDialogueRetentionData({ userId: "user-1", now })).toEqual({
      dataResidency: "RU_ACCOUNT",
      expiresAt: null,
    });
  });

  it("claims only non-expired verified guest dialogues and removes guest identifiers", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: "user-1", emailVerified: true });
    mockDb.dialogue.updateMany.mockResolvedValue({ count: 2 });

    await expect(
      claimGuestDialoguesForUser({ userId: "user-1", guestSessionId: "guest-1", now }),
    ).resolves.toEqual({ claimed: 2, skipped: "none" });

    expect(mockDb.dialogue.updateMany).toHaveBeenCalledWith({
      where: {
        guestSessionId: "guest-1",
        userId: null,
        dataResidency: "RU_TEMP",
        expiresAt: { gt: now },
      },
      data: {
        userId: "user-1",
        guestSessionId: null,
        guestFingerprint: null,
        dataResidency: "RU_ACCOUNT",
        expiresAt: null,
        claimedAt: now,
      },
    });
  });

  it("does not claim guest dialogues before the user has verified their email", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: "user-1", emailVerified: false });

    await expect(
      claimGuestDialoguesForUser({ userId: "user-1", guestSessionId: "guest-1", now }),
    ).resolves.toEqual({ claimed: 0, skipped: "documents_not_accepted" });

    expect(mockDb.dialogue.updateMany).not.toHaveBeenCalled();
  });

  it("physically deletes expired guest dialogues and logs only anonymized statistics", async () => {
    mockDb.dialogue.findMany.mockResolvedValue([
      {
        id: "dlg-1",
        dataResidency: "RU_TEMP",
        status: "ANSWERED",
        intakeProductKey: "perspectives",
        guestFingerprint: "fp-hash",
        createdAt: new Date("2026-06-14T10:00:00.000Z"),
        expiresAt: new Date("2026-06-17T10:00:00.000Z"),
        _count: { messages: 3, productResults: 0 },
      },
    ]);

    await expect(cleanupExpiredGuestDialogues({ now })).resolves.toEqual({
      scanned: 1,
      deleted: 1,
      timestamp: now.toISOString(),
    });

    expect(mockDb.dialogue.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: null,
        guestSessionId: { not: null },
        dataResidency: "RU_TEMP",
        expiresAt: { lte: now },
        deletedAt: null,
      },
    }));
    expect(mockDb.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "system:cron.cleanup-users",
        action: "GUEST_DIALOGUE_TTL_DELETE",
        targetId: "dlg-1",
      }),
    });
    const details = JSON.parse(mockDb.auditLog.create.mock.calls[0][0].data.details);
    expect(details).toMatchObject({
      dataResidency: "RU_TEMP",
      messageCount: 3,
      productResultCount: 0,
      guestFingerprintPresent: true,
      deletedReason: "guest_dialogue_ttl_72h",
    });
    expect(JSON.stringify(details)).not.toContain("fp-hash");
    expect(mockDb.dialogue.delete).toHaveBeenCalledWith({ where: { id: "dlg-1" } });
  });

  it("wires guest TTL fields into schema and cleanup monitoring", () => {
    const schema = source("prisma/schema.prisma");
    const cronJobs = source("src/lib/cron-jobs.ts");
    const status = source("src/lib/admin-system-status.ts");

    expect(schema).toContain("dataResidency");
    expect(schema).toContain("@map(\"data_residency\")");
    expect(schema).toContain("expiresAt");
    expect(schema).toContain("@map(\"expires_at\")");
    expect(schema).toContain("claimedAt");
    expect(cronJobs).toContain("cleanupExpiredGuestDialogues");
    expect(cronJobs).toContain("guestDialogueCleanup");
    expect(status).toContain("гостевых диалогов");
  });
});
