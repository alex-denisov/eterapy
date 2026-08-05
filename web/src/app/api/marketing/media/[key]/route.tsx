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

/**
 * B660 — обложка перестаёт быть одной и той же карточкой.
 *
 * Владелец 2026-08-05 о ленте сообщества: медиа не должны состоять из сплошного
 * текста. Половину проблемы решает сам текст (см. контракт площадок в
 * `agent-prompt`), вторую — обложка: до этой правки все материалы получали
 * идентичный тёмно-синий прямоугольник, и лента выглядела как один пост,
 * повторённый двадцать раз.
 *
 * Тема выбирается ДЕТЕРМИНИРОВАННО по ключу публикации: один и тот же материал
 * всегда отдаёт одну и ту же картинку (площадки перезапрашивают обложку, и
 * «мигающая» картинка выглядела бы как подмена), а соседние материалы —
 * разные. Мы не работаем с генерацией изображений: это разные палитры и разная
 * геометрия свечения, то есть узнаваемый бренд с вариациями, а не случайность.
 */
const COVER_THEMES = [
  { bg: "#081223", ink: "#f8fafc", eyebrow: "#f2c37d", warm: "255,215,154", cool: "142,137,214", accent: "#ffd79a", accentInk: "#081223" },
  { bg: "#141024", ink: "#f6f2ff", eyebrow: "#d9b7ff", warm: "214,171,255", cool: "120,160,232", accent: "#d9b7ff", accentInk: "#191231" },
  { bg: "#0b1f1c", ink: "#eefaf4", eyebrow: "#9fe3c4", warm: "159,227,196", cool: "120,196,214", accent: "#9fe3c4", accentInk: "#07211c" },
  { bg: "#231218", ink: "#fff1f0", eyebrow: "#f6ab9d", warm: "246,171,157", cool: "196,140,214", accent: "#f6ab9d", accentInk: "#2b1218" },
  { bg: "#101a2c", ink: "#eef4ff", eyebrow: "#8fc7ff", warm: "143,199,255", cool: "168,150,236", accent: "#8fc7ff", accentInk: "#0c1626" },
  { bg: "#1d1608", ink: "#fff8e8", eyebrow: "#f3d07a", warm: "243,208,122", cool: "214,150,110", accent: "#f3d07a", accentInk: "#221904" },
] as const;

/** Небольшой стабильный хеш строки — тот же на всех нодах и между перезапусками. */
function coverThemeFor(key: string) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const positive = hash >>> 0;
  const theme = COVER_THEMES[positive % COVER_THEMES.length];
  // Геометрия свечения тоже меняется — иначе шесть палитр читаются как один
  // макет, перекрашенный шесть раз.
  const mirrored = (positive >>> 8) % 2 === 1;
  return { ...theme, mirrored };
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
  const theme = coverThemeFor(key);

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
