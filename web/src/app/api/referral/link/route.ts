import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { createSafeShareLink, shareLandingUrl } from "@/lib/share-referral";
import { log, serializeError } from "@/lib/logger";

// B464 IB5 — get-or-create the user's stable personal referral link. Reuses the
// existing ShareLink infra; the reward economics live in the deferred backend
// blocks, so this is a link + read surface only.
const REFERRAL_SOURCE_TYPE = "referral";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    let link = await db.shareLink.findFirst({
      where: { ownerUserId: userId, sourceType: REFERRAL_SOURCE_TYPE, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { token: true },
    });

    if (!link) {
      const created = await createSafeShareLink({
        ownerUserId: userId,
        sourceType: REFERRAL_SOURCE_TYPE,
        previewText:
          "Я пробую ETerapy — здесь можно бережно разобраться в том, что беспокоит. Дарю тебе первый разбор.",
      });
      link = { token: created.token };
    }

    return NextResponse.json({ url: shareLandingUrl(link.token, REFERRAL_SOURCE_TYPE) });
  } catch (error) {
    log.error("referral.link_failed", { error: serializeError(error) });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
