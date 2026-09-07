import { ImageResponse } from "next/og";
import db from "@/lib/db";
import { CoverArt, coverCanvas } from "@/lib/marketing/cover-art";

export const runtime = "nodejs";

const VISIBLE_STATUSES = ["SCHEDULED", "PUBLISHING", "PUBLISHED"] as const;

function compact(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit
    ? normalized
    : `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const publication = await db.externalPublication.findFirst({
    where: {
      key,
      status: { in: [...VISIBLE_STATUSES] },
      contentType: { not: "COMMENT" },
    },
    select: {
      title: true,
      cluster: true,
      targetQuery: true,
      platform: true,
      scheduledFor: true,
    },
  });
  if (!publication) {
    return new Response("Not found", { status: 404 });
  }

  const title = compact(publication.title, 118);
  const eyebrow = compact(
    publication.cluster || publication.targetQuery || "Вопрос для саморефлексии",
    52,
  );
  const canvas = coverCanvas(publication.platform);

  const url = new URL(_request.url);
  const requestedLayout = url.searchParams.get("layout");
  const isChat = requestedLayout === "chat_mockup"
    || (!requestedLayout && (publication.title.includes("«") || /диалог|переписк|сообщен|написал|молчани/i.test(publication.title)));

  return new ImageResponse(
    (
      <CoverArt
        slotKey={key}
        platform={publication.platform}
        title={title}
        eyebrow={eyebrow}
        scheduledFor={publication.scheduledFor}
        layout={isChat ? "chat_mockup" : "art"}
      />
    ),
    {
      width: canvas.width,
      height: canvas.height,
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
