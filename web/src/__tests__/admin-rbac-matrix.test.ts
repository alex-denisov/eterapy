import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  ALL_PERMISSIONS,
  DEFAULT_ADMIN_PERMISSIONS,
  V5_REQUIRED_PERMISSIONS,
  getUserPermissions,
} from "@/lib/moderator-permissions";
import { PATCH as patchUsers, POST as postUsers } from "@/app/api/admin/users/route";
import { POST as postPractitionerPayout } from "@/app/api/admin/practitioners/[id]/payout/route";
import { PATCH as patchSettings } from "@/app/api/admin/settings/route";

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    moderatorPermission: { findMany: jest.fn() },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
    practitioner: {
      findUnique: jest.fn(),
    },
    payout: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/audit", () => ({
  __esModule: true,
  logAudit: jest.fn(),
}));

jest.mock("@/lib/email", () => ({
  __esModule: true,
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock("@/lib/practitioner-balance", () => ({
  __esModule: true,
  computePractitionerBalance: jest.fn(),
}));

jest.mock("@/lib/platform-settings", () => ({
  __esModule: true,
  getAllSettings: jest.fn(),
  setSettings: jest.fn(),
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDb = db as jest.Mocked<typeof db>;
const mockLogAudit = logAudit as jest.MockedFunction<typeof logAudit>;

function request(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }) as NextRequest;
}

describe("v5 admin RBAC matrix", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
      expires: "2026-04-28T00:00:00.000Z",
    } as never);
    (mockDb.moderatorPermission.findMany as jest.Mock).mockResolvedValue([]);
  });

  it("keeps every v5 permission key in the SUPERADMIN matrix", async () => {
    const permissions = await getUserPermissions("superadmin-1", "SUPERADMIN");

    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    expect(permissions).toEqual(expect.arrayContaining(V5_REQUIRED_PERMISSIONS));
    expect(permissions).toEqual(expect.arrayContaining([
      "ai.configure",
      "analytics.view",
      "payments.refund",
      "subscriptions.manage",
      "notifications.diagnose",
      "seo.manage",
      "system.operate",
    ]));
    expect(mockDb.moderatorPermission.findMany).not.toHaveBeenCalled();
  });

  it("gives default ADMIN accounts read-only baseline access without privileged product rights", async () => {
    const permissions = await getUserPermissions("admin-1", "ADMIN");

    expect(permissions).toEqual(DEFAULT_ADMIN_PERMISSIONS);
    expect(permissions).not.toEqual(expect.arrayContaining([
      "ai.configure",
      "analytics.view",
      "payments.refund",
      "subscriptions.manage",
      "notifications.diagnose",
      "seo.manage",
      "system.operate",
    ]));
    expect(mockDb.moderatorPermission.findMany).toHaveBeenCalledWith({
      where: { moderatorId: "admin-1", granted: true },
      select: { permission: true },
    });
  });

  it("rejects role mutations from non-SUPERADMIN users", async () => {
    const response = await patchUsers(request("https://admin.eterapy.com/api/admin/users", "PATCH", {
      userId: "client-1",
      role: "ADMIN",
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("суперадмин");
    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("allows SUPERADMIN to mutate role with an audit trail", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: "superadmin-1", role: "SUPERADMIN" },
      expires: "2026-04-28T00:00:00.000Z",
    } as never);
    // B347: role mutations now run inside a transaction that keeps the
    // Practitioner profile in sync. Demotion to CLIENT checks for an existing
    // profile to suspend (none here → no-op).
    const txUserUpdate = jest.fn().mockResolvedValue({
      id: "client-1",
      name: "Client",
      role: "CLIENT",
    });
    const txPractitionerFindUnique = jest.fn().mockResolvedValue(null);
    const txPractitionerUpdate = jest.fn();
    (mockDb.$transaction as jest.Mock).mockImplementation(async (callback) => callback({
      user: { update: txUserUpdate },
      practitioner: { findUnique: txPractitionerFindUnique, update: txPractitionerUpdate },
    }));

    const response = await patchUsers(request("https://admin.eterapy.com/api/admin/users", "PATCH", {
      userId: "client-1",
      role: "CLIENT",
    }));

    expect(response.status).toBe(200);
    expect(txUserUpdate).toHaveBeenCalledWith({
      where: { id: "client-1" },
      data: { role: "CLIENT" },
      select: { id: true, name: true, role: true },
    });
    // Demotion path probes for a profile to suspend; finds none → never updates.
    expect(txPractitionerFindUnique).toHaveBeenCalled();
    expect(txPractitionerUpdate).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledWith("superadmin-1", "PROFILE_UPDATE", "client-1", "role");
  });

  it("keeps manual moderator creation SUPERADMIN-only", async () => {
    const response = await postUsers(request("https://admin.eterapy.com/api/admin/users", "POST", {
      role: "ADMIN",
      name: "Moderator",
      email: "moderator@example.com",
      password: "strongpass",
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("ADMIN");
    expect(mockDb.user.findUnique).not.toHaveBeenCalled();
  });

  it("creates practitioner accounts from the unified users endpoint", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: "superadmin-1", role: "SUPERADMIN" },
      expires: "2026-04-28T00:00:00.000Z",
    } as never);
    (mockDb.user.findUnique as jest.Mock).mockResolvedValue(null);

    const txUserCreate = jest.fn().mockResolvedValue({
      id: "user-pr-1",
      email: "praktik@example.com",
      name: "Анна Практик",
      role: "PRACTITIONER",
      createdAt: new Date("2026-05-29T00:00:00.000Z"),
    });
    const txPractitionerFindUnique = jest.fn().mockResolvedValue(null);
    const txPractitionerCreate = jest.fn().mockResolvedValue({
      id: "prac-1",
      slug: "anna-praktik",
      status: "PENDING",
    });
    (mockDb.$transaction as jest.Mock).mockImplementation(async (callback) => callback({
      user: { create: txUserCreate },
      practitioner: {
        findUnique: txPractitionerFindUnique,
        create: txPractitionerCreate,
      },
    }));

    const response = await postUsers(request("https://admin.eterapy.com/api/admin/users", "POST", {
      role: "PRACTITIONER",
      name: "Анна Практик",
      email: "praktik@example.com",
      password: "strongpass",
      title: "Психолог",
      bio: "Работает с отношениями",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(txUserCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        role: "PRACTITIONER",
        provider: "manual",
        emailVerified: true,
      }),
    }));
    // B347/Механика 9: admin-created practitioners go live immediately (ACTIVE)
    // so they have a landing page and participate in search/recommendations.
    expect(txPractitionerCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "user-pr-1",
        slug: "anna-praktik",
        status: "ACTIVE",
        title: "Психолог",
      }),
    }));
    expect(mockLogAudit).toHaveBeenCalledWith(
      "superadmin-1",
      "PRACTITIONER_CREATE",
      "user-pr-1",
      "created practitioner by admin (manual)",
    );
  });

  it("blocks practitioner payout without practitioners.payout", async () => {
    const response = await postPractitionerPayout(
      request("https://admin.eterapy.com/api/admin/practitioners/prac-1/payout", "POST"),
      { params: Promise.resolve({ id: "prac-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("practitioners.payout");
    expect(mockDb.practitioner.findUnique).not.toHaveBeenCalled();
    expect(mockDb.payout.create).not.toHaveBeenCalled();
  });

  it("keeps platform settings writable only by SUPERADMIN", async () => {
    const response = await patchSettings(request("https://admin.eterapy.com/api/admin/settings", "PATCH", {
      settings: { seoTitle: "ETerapy" },
    }));

    expect(response.status).toBe(403);
  });
});
