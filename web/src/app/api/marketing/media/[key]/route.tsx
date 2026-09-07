import { ImageResponse } from "next/og";
import db from "@/lib/db";
import { CoverArt, coverCanvas } from "@/lib/marketing/cover-art";
import { coverLayoutFor } from "@/lib/marketing/cover-layout";
import { ogFonts } from "@/lib/marketing/cover-fonts";

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
      body: true,
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

  /**
   * B727 — раскладка берётся из общего правила (`cover-layout`), а не из второй
   * копии эвристики по заголовку. Параметр `?layout=` остаётся сильнее правила:
   * его ставит агент в момент утверждения, и обложка обязана слушаться его,
   * даже если тело позже переписали.
   */
  const url = new URL(_request.url);
  const requestedLayout = url.searchParams.get("layout");
  const decided = coverLayoutFor({
    title: publication.title,
    body: publication.body,
    cluster: publication.cluster,
  });
  const isChat = requestedLayout === "chat_mockup"
    || (!requestedLayout && decided.layout === "chat_mockup");

  /**
   * B731 — Roboto передаётся ТОЛЬКО мокапу переписки.
   *
   * Мокап обязан быть набран тем же шрифтом, что настоящий Telegram на Android.
   * Графической раскладке он не нужен, а вреден: как только у `ImageResponse`
   * появляется свой список шрифтов, встроенный шрифт `next/og` не грузится
   * вовсе, и знаки вне вшитого подмножества (→, ✓, ₽ — проверено по таблице
   * cmap) пропали бы из заголовков молча, без ошибки.
   */
  const fonts = isChat ? await ogFonts() : [];

  return new ImageResponse(
    (
      <CoverArt
        slotKey={key}
        platform={publication.platform}
        title={title}
        eyebrow={eyebrow}
        scheduledFor={publication.scheduledFor}
        layout={isChat ? "chat_mockup" : "art"}
        messageText={decided.messageText ?? undefined}
      />
    ),
    {
      width: canvas.width,
      height: canvas.height,
      ...(fonts.length > 0 ? { fonts } : {}),
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
