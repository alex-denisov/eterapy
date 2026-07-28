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

    // B466 (матрица 23 июня): расшифровка (server-STT) — платформенная, для
    // ВСЕХ тарифов; без обращения к подписке.
    await expect(practitionerHasFeature("user-1", "server_stt", mockDb as never, new Date("2026-06-06T00:00:00.000Z")))
      .resolves.toBe(true);
    expect(mockDb.userSubscription.findFirst).not.toHaveBeenCalled();

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
    expect(controls).toContain("AI-конспект сессии");
    expect(prompts).toContain('"session-summary"');
    expect(prompts).toContain("верни только JSON с полями practitionerNotesText");
    expect(prompts).toContain("помощник практикующего специалиста ETerapy");
  });

  it("does not sell compliance as a Practitioner Pro perk", () => {
    const dashboard = source("src/app/cabinet/practitioner/page.tsx");
    const tariffTab = source("src/app/cabinet/practitioner/finance/tariff-tab.tsx");

    // B466: комплаенс/безопасность — платформенный процесс (запись включена на
    // каждой сессии), а не перк тарифа; «Тариф» прямо говорит об этом.
    expect(dashboard).toContain("запись включена");
    expect(dashboard).not.toContain("Комплаенс");
    expect(tariffTab).not.toContain("Комплаенс-подсказки");
    expect(tariffTab).not.toContain("compliance-проверки");
    expect(tariffTab).toContain("Расшифровка и комплаенс — за счёт платформы на всех тарифах");
  });
});
