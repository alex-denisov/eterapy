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
import { PATCH as patchUsers } from "@/app/api/admin/users/route";
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
      update: jest.fn(),
    },
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
    });
    mockDb.moderatorPermission.findMany.mockResolvedValue([]);
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

  it("gives default ADMIN accounts read-only baseline access without privileged v5 rights", async () => {
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

  it("rejects role and free-limit mutations from non-SUPERADMIN users", async () => {
    const response = await patchUsers(request("https://admin.eterapy.com/api/admin/users", "PATCH", {
      userId: "client-1",
      role: "ADMIN",
      freeToolsLimit: "unlimited",
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("суперадмин");
    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("allows SUPERADMIN to mutate role and free limit with an audit trail", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: "superadmin-1", role: "SUPERADMIN" },
      expires: "2026-04-28T00:00:00.000Z",
    });
    mockDb.user.update.mockResolvedValue({
      id: "client-1",
      name: "Client",
      role: "CLIENT",
      freeToolsLimit: 0,
    });

    const response = await patchUsers(request("https://admin.eterapy.com/api/admin/users", "PATCH", {
      userId: "client-1",
      role: "CLIENT",
      freeToolsLimit: "unlimited",
    }));

    expect(response.status).toBe(200);
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: "client-1" },
      data: { freeToolsLimit: 0, role: "CLIENT" },
      select: { id: true, name: true, freeToolsLimit: true, role: true },
    });
    expect(mockLogAudit).toHaveBeenCalledWith("superadmin-1", "PROFILE_UPDATE", "client-1", "freeToolsLimit,role");
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
