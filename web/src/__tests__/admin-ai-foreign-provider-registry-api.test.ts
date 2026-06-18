import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { GET } from "@/app/api/admin/ai/foreign-provider-registry/route";
import { REQUEST_ID_HEADER } from "@/lib/request-context";

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("@/lib/moderator-permissions", () => ({
  __esModule: true,
  getUserPermissions: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    foreignProviderRegistry: { findMany: jest.fn() },
  },
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockGetUserPermissions = getUserPermissions as jest.MockedFunction<typeof getUserPermissions>;
const mockDb = db as jest.Mocked<typeof db>;

function request(format?: string) {
  const url = format
    ? `https://admin.eterapy.com/api/admin/ai/foreign-provider-registry?format=${format}`
    : "https://admin.eterapy.com/api/admin/ai/foreign-provider-registry";
  return new Request(url, {
    headers: { [REQUEST_ID_HEADER]: "registry-123" },
  }) as NextRequest;
}

describe("admin AI foreign provider registry API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "legal-1", role: "SUPERADMIN" },
      expires: "2026-06-18T00:00:00.000Z",
    } as never);
    mockGetUserPermissions.mockResolvedValue(["legal.cross_border.manage"] as never);
    (mockDb.foreignProviderRegistry.findMany as jest.Mock).mockResolvedValue([
      {
        id: "fpr_yandex",
        providerNameInternal: "YANDEX",
        providerCategory: "primary_llm",
        countryOrRegion: "RU",
        role: "Primary Russian LLM and OCR provider",
        potentialDataCategories: ["dialogue_text"],
        status: "ACTIVE",
        legalBasis: "Russian processing contour",
        dpaStatus: "not_required_ru",
        termsReviewStatus: "approved",
        rknCrossBorderStatus: "not_cross_border",
        lastReviewedAt: new Date("2026-06-18T00:00:00.000Z"),
        createdAt: new Date("2026-06-18T00:00:00.000Z"),
        updatedAt: new Date("2026-06-18T00:00:00.000Z"),
      },
      {
        id: "fpr_openrouter",
        providerNameInternal: "OPENROUTER",
        providerCategory: "llm_gateway",
        countryOrRegion: "US",
        role: "Dormant foreign LLM router",
        potentialDataCategories: ["dialogue_text"],
        status: "INACTIVE_FOR_RU",
        legalBasis: null,
        dpaStatus: "not_ready",
        termsReviewStatus: "pending",
        rknCrossBorderStatus: "not_submitted",
        lastReviewedAt: new Date("2026-06-18T00:00:00.000Z"),
        createdAt: new Date("2026-06-18T00:00:00.000Z"),
        updatedAt: new Date("2026-06-18T00:00:00.000Z"),
      },
    ]);
  });

  it("exports registry rows as JSON for legal superadmins", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerNameInternal: "YANDEX", status: "ACTIVE" }),
      expect.objectContaining({ providerNameInternal: "OPENROUTER", status: "INACTIVE_FOR_RU" }),
    ]));
  });

  it("exports registry rows as CSV", async () => {
    const response = await GET(request("csv"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(body).toContain("providerNameInternal,providerCategory");
    expect(body).toContain('"OPENROUTER","llm_gateway"');
  });

  it("rejects superadmins without legal cross-border permission", async () => {
    mockGetUserPermissions.mockResolvedValueOnce(["ai.configure"] as never);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
  });
});
