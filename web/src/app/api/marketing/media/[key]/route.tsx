import { ImageResponse } from "next/og";
import db from "@/lib/db";
import { coverThemeFor } from "@/lib/marketing/cover-theme";

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
  const platform = publication.platform.trim().toUpperCase();
  const theme = coverThemeFor({
    key,
    platform: publication.platform,
    scheduledFor: publication.scheduledFor,
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: theme.bg,
          color: theme.ink,
          fontFamily: "Arial, sans-serif",
          padding: "82px",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "700px",
            height: "700px",
            borderRadius: "999px",
            ...(theme.mirrored ? { left: "-180px" } : { right: "-180px" }),
            top: "-230px",
            background: `radial-gradient(circle, rgba(${theme.warm},.72) 0%, rgba(${theme.warm},.24) 38%, rgba(0,0,0,0) 72%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "720px",
            height: "720px",
            borderRadius: "999px",
            ...(theme.mirrored ? { right: "-300px" } : { left: "-300px" }),
            bottom: "-390px",
            background: `radial-gradient(circle, rgba(${theme.cool},.46) 0%, rgba(0,0,0,0) 70%)`,
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            zIndex: 1,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "18px", fontSize: 34, fontWeight: 700 }}>
              <div
                style={{
                  width: "54px",
                  height: "54px",
                  borderRadius: "999px",
                  background: `radial-gradient(circle at 42% 38%, rgb(${theme.warm}) 0%, ${theme.accent} 48%, rgb(${theme.cool}) 100%)`,
                  boxShadow: `0 0 50px rgba(${theme.warm},.35)`,
                }}
              />
              ETerapy
            </div>
            <div style={{ fontSize: 22, color: theme.eyebrow, opacity: 0.85, letterSpacing: "2px" }}>{platform}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "30px", maxWidth: "940px" }}>
            <div style={{ fontSize: 25, color: theme.eyebrow, textTransform: "uppercase", letterSpacing: "2.5px" }}>
              {eyebrow}
            </div>
            <div style={{ fontSize: title.length > 76 ? 66 : 78, lineHeight: 1.08, fontWeight: 700, letterSpacing: "-2px" }}>
              {title}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 25 }}>
            <div style={{ color: theme.ink, opacity: 0.82 }}>Спокойно разобраться — и увидеть следующий шаг</div>
            <div
              style={{
                display: "flex",
                padding: "18px 28px",
                borderRadius: "999px",
                background: theme.accent,
                color: theme.accentInk,
                fontWeight: 700,
              }}
            >
              Открыть ETerapy
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 1200,
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
