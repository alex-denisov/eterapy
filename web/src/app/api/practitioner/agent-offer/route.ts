import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { AGENT_OFFER_VERSION } from "@/lib/practitioner-compliance";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "PRACTITIONER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!practitioner) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

  const now = new Date();
  await db.practitioner.update({
    where: { id: practitioner.id },
    data: {
      agentOfferAcceptedAt: now,
      agentOfferVersion: AGENT_OFFER_VERSION,
    },
  });

  await logAudit(session.user.id, "AGENT_OFFER_ACCEPT", session.user.id, `Принята агентская оферта ${AGENT_OFFER_VERSION}`);
  return NextResponse.json({ ok: true, version: AGENT_OFFER_VERSION, acceptedAt: now.toISOString() });
}
