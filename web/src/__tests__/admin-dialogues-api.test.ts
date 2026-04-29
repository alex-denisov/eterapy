import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { GET as listAdminDialogues } from "@/app/api/admin/dialogues/route";
import { GET as getAdminDialogue } from "@/app/api/admin/dialogues/[id]/route";

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("@/lib/audit", () => ({
  __esModule: true,
  AUDIT_ACTIONS: {
    DIALOGUE_SUPPORT_VIEW: "DIALOGUE_SUPPORT_VIEW",
  },
  logAudit: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    dialogue: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("@/lib/moderator-permissions", () => ({
  __esModule: true,
  getUserPermissions: jest.fn(),
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDb = db as jest.Mocked<typeof db>;
const mockGetUserPermissions = getUserPermissions as jest.MockedFunction<typeof getUserPermissions>;
const mockLogAudit = logAudit as jest.MockedFunction<typeof logAudit>;

function request(url: string) {
  return {
    url,
    nextUrl: new URL(url),
    headers: new Headers(),
  } as unknown as NextRequest;
}

const now = new Date("2026-04-29T12:00:00.000Z");

describe("admin dialogue support access", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "moderator-1", role: "ADMIN" },
      expires: "2026-04-29T12:00:00.000Z",
    });
    mockGetUserPermissions.mockResolvedValue(["dialogues.view"]);
  });

  it("requires dialogues.view before listing private dialogue metadata", async () => {
    mockGetUserPermissions.mockResolvedValueOnce([]);

    const response = await listAdminDialogues(request("https://admin.eterapy.com/api/admin/dialogues"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
    expect(mockDb.dialogue.findMany).not.toHaveBeenCalled();
  });

  it("lists dialogue metadata without message content for support triage", async () => {
    mockDb.dialogue.findMany.mockResolvedValue([{
      id: "dlg-1",
      userId: "user-1",
      guestSessionId: null,
      title: "Sensitive question",
      status: "OPEN",
      topic: "career",
      difficulty: null,
      safetyLevel: null,
      createdAt: now,
      updatedAt: now,
      _count: { messages: 2 },
    }]);

    const response = await listAdminDialogues(request("https://admin.eterapy.com/api/admin/dialogues?ownerId=user-1&limit=5"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dialogues[0]).toEqual(expect.objectContaining({
      id: "dlg-1",
      ownerType: "user",
      ownerId: "user-1",
      messageCount: 2,
    }));
    expect(body.dialogues[0].messages).toBeUndefined();
    expect(mockDb.dialogue.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { deletedAt: null, userId: "user-1" },
      take: 5,
    }));
  });

  it("requires a support reason before reading private message content", async () => {
    const response = await getAdminDialogue(
      request("https://admin.eterapy.com/api/admin/dialogues/dlg-1"),
      { params: Promise.resolve({ id: "dlg-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("BAD_REQUEST");
    expect(mockDb.dialogue.findFirst).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it("audits support reads that include private message content", async () => {
    mockDb.dialogue.findFirst.mockResolvedValue({
      id: "dlg-1",
      userId: "user-1",
      guestSessionId: null,
      title: "Sensitive question",
      status: "OPEN",
      topic: "career",
      difficulty: null,
      safetyLevel: null,
      createdAt: now,
      updatedAt: now,
      messages: [{
        id: "msg-1",
        role: "USER",
        content: "Private question",
        createdAt: now,
      }],
    });

    const response = await getAdminDialogue(
      request("https://admin.eterapy.com/api/admin/dialogues/dlg-1?reason=support-case-123"),
      { params: Promise.resolve({ id: "dlg-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dialogue.messages[0].content).toBe("Private question");
    expect(mockLogAudit).toHaveBeenCalledWith(
      "moderator-1",
      "DIALOGUE_SUPPORT_VIEW",
      "user-1",
      expect.stringContaining("\"dialogueId\":\"dlg-1\""),
    );
  });
});
