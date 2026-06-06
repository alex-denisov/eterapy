import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { createPractitionerInvite, practitionerInviteLandingUrl } from "@/lib/byoc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanText(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function currentPractitioner() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "PRACTITIONER") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user.id },
    select: { id: true, slug: true },
  });
  if (!practitioner) return { error: NextResponse.json({ error: "Профиль не найден" }, { status: 404 }) };
  return { practitioner };
}

export async function GET() {
  const current = await currentPractitioner();
  if ("error" in current) return current.error;

  const invites = await db.practitionerInvite.findMany({
    where: { practitionerId: current.practitioner.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      token: true,
      label: true,
      freeAiHook: true,
      status: true,
      openedCount: true,
      registeredCount: true,
      bookedCount: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    invites: invites.map((invite) => ({
      ...invite,
      landingUrl: practitionerInviteLandingUrl(current.practitioner.slug, invite.token),
      telegramUrl: `https://t.me/eterapy_bot?start=practitioner_${current.practitioner.slug}`,
    })),
  });
}

export async function POST(req: NextRequest) {
  const current = await currentPractitioner();
  if ("error" in current) return current.error;

  const body = await req.json().catch(() => ({}));
  const invite = await createPractitionerInvite({
    practitionerId: current.practitioner.id,
    label: cleanText(body.label, 80),
    freeAiHook: cleanText(body.freeAiHook, 240),
  });

  return NextResponse.json({
    ok: true,
    invite: {
      ...invite,
      landingUrl: practitionerInviteLandingUrl(current.practitioner.slug, invite.token),
      telegramUrl: `https://t.me/eterapy_bot?start=practitioner_${current.practitioner.slug}`,
    },
  }, { status: 201 });
}
