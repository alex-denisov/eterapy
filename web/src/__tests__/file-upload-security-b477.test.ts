import path from "node:path";
import { File } from "node:buffer";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import db from "@/lib/db";
import { resetAuthRateLimitForTests } from "@/lib/auth-rate-limit";
import { storeFile } from "@/lib/file-storage";
import { auth } from "@/lib/auth";
import { POST } from "@/app/api/files/route";

jest.mock("node:fs/promises", () => ({
  mkdir: jest.fn(),
  unlink: jest.fn(),
  writeFile: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    storedFile: {
      aggregate: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    user: { update: jest.fn() },
  },
}));

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));

const mockDb = db as jest.Mocked<typeof db>;
const mockAuth = auth as jest.MockedFunction<typeof auth>;

describe("B477 file upload security", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAuthRateLimitForTests();
    (mkdir as jest.Mock).mockResolvedValue(undefined);
    (writeFile as jest.Mock).mockResolvedValue(undefined);
    (unlink as jest.Mock).mockResolvedValue(undefined);
    (mockDb.storedFile.aggregate as jest.Mock).mockResolvedValue({ _sum: { sizeBytes: 0 } });
    (mockDb.storedFile.create as jest.Mock).mockResolvedValue({ id: "file-1" });
    mockAuth.mockResolvedValue({ user: { id: "user-1", role: "CLIENT" } } as never);
  });

  it("ignores a traversal-bearing client filename and writes a canonical safe suffix", async () => {
    const file = new File([Buffer.from("%PDF-1.7\nfixture")], "proof./../../../../../.env.local", {
      type: "application/pdf",
    });

    const result = await storeFile("user-1", file, "DOCUMENT");
    const writtenPath = (writeFile as jest.Mock).mock.calls[0][0] as string;
    const expectedRoot = path.join(process.cwd(), "public", "uploads", "documents", "user-1");

    expect(writtenPath.startsWith(`${expectedRoot}${path.sep}`)).toBe(true);
    expect(writtenPath).toMatch(/\.pdf$/);
    expect(writtenPath).not.toContain(".env.local");
    expect(result.url).toMatch(/^\/uploads\/documents\/user-1\/.+\.pdf$/);
    expect(mkdir).toHaveBeenCalledWith(expectedRoot, { recursive: true });
  });

  it("rejects content that does not match its claimed image MIME", async () => {
    const file = new File(["<script>alert(1)</script>"], "avatar.png", { type: "image/png" });

    await expect(storeFile("user-1", file, "AVATAR")).rejects.toThrow(
      "Содержимое файла не соответствует заявленному типу",
    );
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("enforces the aggregate per-user storage quota", async () => {
    (mockDb.storedFile.aggregate as jest.Mock).mockResolvedValue({
      _sum: { sizeBytes: 250 * 1024 * 1024 },
    });
    const file = new File([Buffer.from("%PDF-1.7\nfixture")], "document.pdf", { type: "application/pdf" });

    await expect(storeFile("user-1", file, "DOCUMENT")).rejects.toThrow("Лимит хранилища исчерпан");
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("does not expose the server-only REPORT kind through the client upload route", async () => {
    const form = new FormData();
    form.set("kind", "REPORT");
    form.set("file", new File(["{}"], "report.json", { type: "application/json" }));
    const request = new NextRequest("https://app.eterapy.com/api/files", { method: "POST", body: form });

    const response = await POST(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Недопустимая категория файла" });
    expect(mockDb.storedFile.create).not.toHaveBeenCalled();
  });

  it("removes a file if its database record cannot be created", async () => {
    (mockDb.storedFile.create as jest.Mock).mockRejectedValue(new Error("database unavailable"));
    const file = new File([Buffer.from("%PDF-1.7\nfixture")], "document.pdf", { type: "application/pdf" });

    await expect(storeFile("user-1", file, "DOCUMENT")).rejects.toThrow("database unavailable");
    expect(unlink).toHaveBeenCalledTimes(1);
  });
});
