import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  completeMission,
  listMissionChecklist,
  SELF_REPORTABLE_MISSIONS,
  type OnboardingMissionKey,
} from "@/lib/missions";
import { log, serializeError } from "@/lib/logger";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checklist = await listMissionChecklist(session.user.id);
  return NextResponse.json({ checklist });
}

/**
 * POST — self-report a mission completion.
 *
 * B464 round-4 #7: the «Позвать близкого человека» goal completes when the
 * client actually copies/shares their personal invite link. That action lives
 * in the browser (clipboard / Telegram share), so the client reports it here.
 * Only keys in SELF_REPORTABLE_MISSIONS are accepted — every other mission is
 * completed by its own server-side hook and cannot be self-claimed.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const missionKey = typeof body?.missionKey === "string" ? body.missionKey : "";
  if (!SELF_REPORTABLE_MISSIONS.includes(missionKey as OnboardingMissionKey)) {
    return NextResponse.json({ error: "Эта цель начисляется автоматически" }, { status: 400 });
  }

  try {
    const result = await completeMission({
      userId: session.user.id,
      missionKey: missionKey as OnboardingMissionKey,
      metadata: { surface: "self_report" },
    });
    return NextResponse.json({ ok: true, rewardGranted: result.rewardGranted });
  } catch (error) {
    log.warn("missions.self_report_failed", { error: serializeError(error) });
    return NextResponse.json({ error: "Не удалось отметить цель" }, { status: 500 });
  }
}
