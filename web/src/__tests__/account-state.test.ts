import fs from "node:fs";
import path from "node:path";
import db from "@/lib/db";
import {
  getAccountAccessState,
  inactiveAccountReason,
} from "@/lib/account-state";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
    },
  },
}));

const mockDb = db as jest.Mocked<typeof db>;

describe("B053 account access states", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("classifies active, blocked, deleted, and missing users", async () => {
    mockDb.user.findUnique.mockResolvedValueOnce({ blockedAt: null, deletedAt: null } as never);
    await expect(getAccountAccessState("active-1")).resolves.toBe("active");

    mockDb.user.findUnique.mockResolvedValueOnce({ blockedAt: new Date(), deletedAt: null } as never);
    await expect(getAccountAccessState("blocked-1")).resolves.toBe("blocked");

    mockDb.user.findUnique.mockResolvedValueOnce({ blockedAt: null, deletedAt: new Date() } as never);
    await expect(getAccountAccessState("deleted-1")).resolves.toBe("deleted");

    mockDb.user.findUnique.mockResolvedValueOnce(null);
    await expect(getAccountAccessState("missing-1")).resolves.toBe("missing");
  });

  it("maps inactive states to logout reasons", () => {
    expect(inactiveAccountReason("active")).toBeNull();
    expect(inactiveAccountReason("blocked")).toBe("blocked");
    expect(inactiveAccountReason("deleted")).toBe("deleted");
    expect(inactiveAccountReason("missing")).toBe("deleted");
  });

  it("guards cabinet and admin layouts and renders inactive login state", () => {
    const cabinet = fs.readFileSync(path.join(process.cwd(), "src/app/cabinet/layout.tsx"), "utf8");
    const admin = fs.readFileSync(path.join(process.cwd(), "src/app/admin/layout.tsx"), "utf8");
    const login = fs.readFileSync(path.join(process.cwd(), "src/app/(auth)/login/page.tsx"), "utf8");

    expect(cabinet).toContain("getSessionAccountAccessState");
    expect(admin).toContain("getSessionAccountAccessState");
    expect(login).toContain("inactive-account-state");
    expect(login).toContain("Аккаунт заблокирован");
  });
});
