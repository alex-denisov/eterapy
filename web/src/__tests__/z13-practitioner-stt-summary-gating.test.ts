import fs from "node:fs";
import path from "node:path";
import db from "@/lib/db";
import {
  getPractitionerFeaturePlanKeys,
  practitionerHasFeature,
} from "@/lib/practitioner-entitlements";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    userSubscription: {
      findFirst: jest.fn(),
    },
  },
}));

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const mockDb = db as unknown as {
  userSubscription: {
    findFirst: jest.Mock;
  };
};

describe("Z13 practitioner STT and summary subscription gates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("maps browser STT and session summary to active Practitioner Pro tiers", async () => {
    expect(getPractitionerFeaturePlanKeys("browser_stt")).toEqual(["practitioner_pro", "practitioner_pro_plus"]);
    expect(getPractitionerFeaturePlanKeys("session_summary")).toEqual(["practitioner_pro", "practitioner_pro_plus"]);
    expect(getPractitionerFeaturePlanKeys("server_stt")).toEqual(["practitioner_pro_plus"]);

    mockDb.userSubscription.findFirst.mockResolvedValueOnce({ id: "sub-1", planKey: "practitioner_pro" });

    await expect(practitionerHasFeature("user-1", "browser_stt", mockDb as never, new Date("2026-06-06T00:00:00.000Z")))
      .resolves.toBe(true);

    expect(mockDb.userSubscription.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: "user-1",
        planKey: { in: ["practitioner_pro", "practitioner_pro_plus"] },
        status: { in: ["TRIALING", "ACTIVE"] },
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: expect.any(Date) } }],
      }),
      select: { id: true, planKey: true },
    }));
  });

  it("denies expired or absent practitioner subscription features", async () => {
    mockDb.userSubscription.findFirst.mockResolvedValueOnce(null);

    await expect(practitionerHasFeature("user-1", "session_summary", mockDb as never, new Date("2026-06-06T00:00:00.000Z")))
      .resolves.toBe(false);
  });

  it("keeps paid transcript and summary behind gates while compliance remains universal", () => {
    const transcriptRoute = source("src/app/api/video/transcript/route.ts");
    const room = source("src/components/video/video-room.tsx");
    const controls = source("src/components/video/video-controls.tsx");
    const prompts = source("src/lib/ai-gateway/prompts.ts");

    expect(transcriptRoute).toContain("practitionerHasFeature");
    expect(transcriptRoute).toContain('practitionerHasFeature(practitionerUserId, "browser_stt"');
    expect(transcriptRoute).toContain('practitionerHasFeature(userId, "session_summary"');
    expect(transcriptRoute).toContain("transcriptAllowed");
    expect(transcriptRoute).toContain("summaryAllowed");
    expect(transcriptRoute).toContain("status: 403");
    expect(transcriptRoute).toContain("reviewSessionCompliance");
    expect(transcriptRoute).toContain("generateSessionSummary");
    expect(transcriptRoute).toContain("summaryText: result.summaryText");
    expect(room).toContain('sttSource: "browser_speech_recognition"');
    expect(controls).toContain("Создать AI резюме сессии");
    expect(prompts).toContain('"session-summary"');
    expect(prompts).toContain("Return only JSON with practitionerNotesText");
  });

  it("does not sell compliance as a Practitioner Pro perk", () => {
    const dashboard = source("src/app/cabinet/practitioner/page.tsx");
    const subscriptionPage = source("src/app/cabinet/practitioner/subscription/page.tsx");

    expect(dashboard).toContain('data-testid="practitioner-compliance-notices"');
    expect(dashboard).toContain("complianceReviewCount");
    expect(dashboard).not.toContain('["Compliance", complianceReviewCount');
    expect(subscriptionPage).not.toContain("Комплаенс-подсказки");
    expect(subscriptionPage).not.toContain("compliance-проверки");
    expect(subscriptionPage).toContain("безопасность сессий работает для всех");
  });
});
