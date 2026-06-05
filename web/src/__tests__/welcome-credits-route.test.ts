import type { NextRequest } from "next/server";
import { usersDb } from "@/lib/users-db";
import { grantWelcomeCredits } from "@/lib/welcome-credits";
import { POST as verifyEmail } from "@/app/api/auth/verify-email/route";

jest.mock("@/lib/users-db", () => ({
  __esModule: true,
  usersDb: {
    getByVerificationToken: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock("@/lib/welcome-credits", () => ({
  __esModule: true,
  grantWelcomeCredits: jest.fn(),
}));

jest.mock("@/lib/audit", () => ({
  __esModule: true,
  logAudit: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  log: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockUsersDb = usersDb as jest.Mocked<typeof usersDb>;
const mockGrantWelcomeCredits = grantWelcomeCredits as jest.MockedFunction<typeof grantWelcomeCredits>;

function jsonRequest(body: unknown) {
  return new Request("https://eterapy.com/api/auth/verify-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-eterapy-device-id": "device-1",
    },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("Y10 Z5 welcome credit trigger", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGrantWelcomeCredits.mockResolvedValue({ status: "granted", amount: 3 });
  });

  it("grants welcome credits after the email is verified", async () => {
    mockUsersDb.getByVerificationToken.mockResolvedValueOnce({
      id: "user-1",
      email: "new@example.com",
      verificationExpires: new Date(Date.now() + 60_000),
    } as never);
    mockUsersDb.update.mockResolvedValueOnce({ id: "user-1" } as never);

    const response = await verifyEmail(jsonRequest({ token: "verify-token" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockGrantWelcomeCredits).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.any(Request),
      userId: "user-1",
    }));
  });

  it("does not grant welcome credits for an expired verification link", async () => {
    mockUsersDb.getByVerificationToken.mockResolvedValueOnce({
      id: "user-1",
      email: "new@example.com",
      verificationExpires: new Date(Date.now() - 60_000),
    } as never);

    const response = await verifyEmail(jsonRequest({ token: "expired-token" }));

    expect(response.status).toBe(400);
    expect(mockGrantWelcomeCredits).not.toHaveBeenCalled();
  });

  it("keeps email verification successful when the welcome grant fails", async () => {
    mockUsersDb.getByVerificationToken.mockResolvedValueOnce({
      id: "user-1",
      email: "new@example.com",
      verificationExpires: new Date(Date.now() + 60_000),
    } as never);
    mockUsersDb.update.mockResolvedValueOnce({ id: "user-1" } as never);
    mockGrantWelcomeCredits.mockRejectedValueOnce(new Error("temporary ledger outage"));

    const response = await verifyEmail(jsonRequest({ token: "verify-token" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
