import { ImageResponse } from "next/og";
import db from "@/lib/db";

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

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#081223",
          color: "#f8fafc",
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
            right: "-180px",
            top: "-230px",
            background: "radial-gradient(circle, rgba(255,215,154,.72) 0%, rgba(212,161,90,.24) 38%, rgba(8,18,35,0) 72%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "720px",
            height: "720px",
            borderRadius: "999px",
            left: "-300px",
            bottom: "-390px",
            background: "radial-gradient(circle, rgba(142,137,214,.46) 0%, rgba(8,18,35,0) 70%)",
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
                  background: "radial-gradient(circle at 42% 38%, #ffd79a 0%, #d4a15a 48%, #8e89d6 100%)",
                  boxShadow: "0 0 50px rgba(255,215,154,.35)",
                }}
              />
              ETerapy
            </div>
            <div style={{ fontSize: 22, color: "#c7c2f0", letterSpacing: "2px" }}>{platform}</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "30px", maxWidth: "940px" }}>
            <div style={{ fontSize: 25, color: "#f2c37d", textTransform: "uppercase", letterSpacing: "2.5px" }}>
              {eyebrow}
            </div>
            <div style={{ fontSize: title.length > 76 ? 66 : 78, lineHeight: 1.08, fontWeight: 700, letterSpacing: "-2px" }}>
              {title}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 25 }}>
            <div style={{ color: "#d7deea" }}>Спокойно разобраться — и увидеть следующий шаг</div>
            <div
              style={{
                display: "flex",
                padding: "18px 28px",
                borderRadius: "999px",
                background: "#ffd79a",
                color: "#081223",
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
