import { ACCOUNT_SOFT_DELETE_GRACE_DAYS } from "@/lib/account-deletion-policy";
import { cleanupRetentionData, RETENTION_POLICY, retentionCutoffs } from "@/lib/data-retention";
import db from "@/lib/db";
import fs from "fs";
import path from "path";

jest.mock("@/lib/db", () => {
  const dbMock: {
    user: { findMany: jest.Mock; update: jest.Mock; delete: jest.Mock };
    dialogue: { findMany: jest.Mock; delete: jest.Mock };
    aIRequest: { findMany: jest.Mock; delete: jest.Mock };
    auditLog: { findMany: jest.Mock; deleteMany: jest.Mock; create: jest.Mock };
    deletionLog: { create: jest.Mock };
    $transaction: jest.Mock;
  } = {
    user: { findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
    dialogue: { findMany: jest.fn(), delete: jest.fn() },
    aIRequest: { findMany: jest.fn(), delete: jest.fn() },
    auditLog: { findMany: jest.fn(), deleteMany: jest.fn(), create: jest.fn() },
    deletionLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  dbMock.$transaction.mockImplementation(async (fn: (tx: typeof dbMock) => unknown) => fn(dbMock));
  return { __esModule: true, default: dbMock };
});

const mockDb = db as unknown as {
  user: { findMany: jest.Mock; update: jest.Mock; delete: jest.Mock };
  dialogue: { findMany: jest.Mock; delete: jest.Mock };
  aIRequest: { findMany: jest.Mock; delete: jest.Mock };
  auditLog: { findMany: jest.Mock; deleteMany: jest.Mock; create: jest.Mock };
  deletionLog: { create: jest.Mock };
  $transaction: jest.Mock;
};

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("B430 data retention", () => {
  const now = new Date("2026-06-18T12:00:00.000Z");

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.user.findMany.mockResolvedValue([]);
    mockDb.dialogue.findMany.mockResolvedValue([]);
    mockDb.aIRequest.findMany.mockResolvedValue([]);
    mockDb.auditLog.findMany.mockResolvedValue([]);
  });

  it("publishes the legal retention matrix and operational cutoffs", () => {
    expect(RETENTION_POLICY.guestPromptResult.ttlHours).toBe(72);
    expect(RETENTION_POLICY.routingLogs.guestTtlHours).toBe(72);
    expect(RETENTION_POLICY.routingLogs.paidYears).toBe(3);
    expect(RETENTION_POLICY.accountProfile.softDeleteGraceDays).toBe(ACCOUNT_SOFT_DELETE_GRACE_DAYS);
    expect(RETENTION_POLICY.securityLogs.ttlMonths).toBe(12);
    expect(RETENTION_POLICY.payments.ttlYears).toBe(5);
    expect(RETENTION_POLICY.agentReports.ttlYears).toBe(5);
    expect(RETENTION_POLICY.disputes.ttlYears).toBe(3);
    expect(RETENTION_POLICY.chargebackEvidence.ttlYears).toBe(3);
    expect(RETENTION_POLICY.anonymizedAnalytics.retention).toBe("indefinite");

    expect(retentionCutoffs(now)).toEqual({
      // Срок живёт в `account-deletion-policy.ts` — единственное место (B599,
      // батч №20). Раньше здесь было 7 дней против 10, обещанных в настройках.
      accountAnonymizeBefore: new Date("2026-06-08T12:00:00.000Z"),
      guestDialogueBefore: now,
      guestRoutingLogBefore: new Date("2026-06-15T12:00:00.000Z"),
      paidRoutingLogBefore: new Date("2023-06-18T12:00:00.000Z"),
      paymentBefore: new Date("2021-06-18T12:00:00.000Z"),
      agentReportBefore: new Date("2021-06-18T12:00:00.000Z"),
      disputeBefore: new Date("2023-06-18T12:00:00.000Z"),
      chargebackEvidenceBefore: new Date("2023-06-18T12:00:00.000Z"),
      securityLogBefore: new Date("2025-06-18T12:00:00.000Z"),
    });
  });

  it("anonymizes soft-deleted accounts after the promised grace period and records a deletion log", async () => {
    mockDb.user.findMany.mockResolvedValue([
      {
        id: "user-1",
        email: "client@example.com",
        deletedAt: new Date("2026-06-10T11:00:00.000Z"),
      },
    ]);

    await expect(cleanupRetentionData({ now })).resolves.toMatchObject({
      usersAnonymized: 1,
    });

    expect(mockDb.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        deletedAt: { lte: new Date("2026-06-08T12:00:00.000Z") },
        retentionAnonymizedAt: null,
      },
    }));
    expect(mockDb.user.delete).not.toHaveBeenCalled();
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({
        email: "deleted-user-1@retention.eterapy.local",
        normalizedEmail: null,
        name: "Удаленный пользователь",
        password: "deleted:user-1",
        retentionAnonymizedAt: now,
      }),
    });
    expect(mockDb.deletionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        category: "account_profile",
        action: "ANONYMIZE",
        targetType: "User",
        targetId: "user-1",
        policy: "account_profile_7d_anonymize",
      }),
    });
    expect(JSON.stringify(mockDb.deletionLog.create.mock.calls[0][0].data.metadata)).not.toContain("client@example.com");
  });

  it("deletes anonymous unpaid routing logs after 72 hours and records a deletion log", async () => {
    mockDb.aIRequest.findMany.mockResolvedValue([
      {
        id: "ai-guest-1",
        feature: "dialogue-router",
        status: "SUCCEEDED",
        createdAt: new Date("2026-06-14T10:00:00.000Z"),
        totalTokens: 300,
        estimatedCostMicros: 1200,
        attempts: [{ id: "attempt-1" }],
      },
    ]);

    await expect(cleanupRetentionData({ now })).resolves.toMatchObject({
      guestRoutingLogsDeleted: 1,
    });

    expect(mockDb.aIRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: null,
        billingEventId: null,
        createdAt: { lte: new Date("2026-06-15T12:00:00.000Z") },
      },
    }));
    expect(mockDb.aIRequest.delete).toHaveBeenCalledWith({ where: { id: "ai-guest-1" } });
    expect(mockDb.deletionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        category: "routing_logs",
        action: "DELETE",
        targetType: "AIRequest",
        targetId: "ai-guest-1",
        policy: "routing_logs_guest_72h_delete",
      }),
    });
  });

  it("deletes security audit logs after 12 months and records a deletion log", async () => {
    mockDb.auditLog.findMany.mockResolvedValue([
      {
        id: "audit-1",
        action: "LOGIN",
        createdAt: new Date("2025-06-01T12:00:00.000Z"),
      },
      {
        id: "audit-2",
        action: "PASSWORD_RESET",
        createdAt: new Date("2025-05-30T12:00:00.000Z"),
      },
    ]);
    mockDb.auditLog.deleteMany.mockResolvedValue({ count: 2 });

    await expect(cleanupRetentionData({ now })).resolves.toMatchObject({
      securityAuditLogsDeleted: 2,
    });

    expect(mockDb.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        createdAt: { lte: new Date("2025-06-18T12:00:00.000Z") },
      },
    }));
    expect(mockDb.auditLog.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["audit-1", "audit-2"] } },
    });
    expect(mockDb.deletionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        category: "security_logs",
        action: "DELETE",
        targetType: "AuditLog",
        targetId: null,
        policy: "security_logs_12mo_delete",
        metadata: expect.objectContaining({ count: 2 }),
      }),
    });
  });

  it("wires the unified retention job without early deletion of legal records", () => {
    const schema = source("prisma/schema.prisma");
    const cronJobs = source("src/lib/cron-jobs.ts");
    const status = source("src/lib/admin-system-status.ts");
    const retention = source("src/lib/data-retention.ts");

    expect(schema).toContain("model DeletionLog");
    expect(schema).toContain("@@map(\"deletion_logs\")");
    expect(schema).toContain("retentionAnonymizedAt");
    expect(schema).toContain("@map(\"retention_anonymized_at\")");
    expect(cronJobs).toContain("cleanupRetentionData");
    expect(cronJobs).not.toContain("CLEANUP_GRACE_DAYS = 10");
    expect(status).toContain("retention matrix");
    // Строка статуса подставляет срок из общего модуля, поэтому в ИСХОДНИКЕ
    // числа нет — и проверять его текстом здесь значило бы снова развести
    // показанное и настоящее. Сверяем ссылку на общий модуль.
    expect(status).toContain("ACCOUNT_SOFT_DELETE_GRACE_DAYS");
    expect(status).not.toMatch(/через \d+ дней/);

    expect(retention).not.toMatch(/\bpayment\.(delete|deleteMany)\b/);
    expect(retention).not.toMatch(/\btransaction\.(delete|deleteMany)\b/);
    expect(retention).not.toMatch(/\bagentReport\.(delete|deleteMany)\b/);
    expect(retention).not.toMatch(/\bcomplaint\.(delete|deleteMany)\b/);
    expect(retention).not.toMatch(/\bpayout\.(delete|deleteMany)\b/);
  });
});
