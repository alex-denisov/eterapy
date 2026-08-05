/**
 * B678 — картинка карты дня.
 *
 * АДРЕС НЕ СОДЕРЖИТ ЧЕЛОВЕКА. В ключе только карта и её положение
 * (`major-00-up`), поэтому картинку можно кэшировать вечно и отдавать без
 * авторизации: узнать по ней, кому именно выпала карта, нельзя. Персональна
 * здесь только выборка карты, и она остаётся на сервере.
 *
 * Скан берётся с диска и вставляется в разметку как data-URI, а не ссылкой:
 * satori внутри `next/og` иначе ходил бы за картинкой по сети к самому себе —
 * лишний прыжок, который на РФ-ноде уже однажды стоил нам молчаливых отказов
 * (`reference_telegram_wont_fetch_ru_node_urls`).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { tarotCardArtworkPath, tarotDayOrientationLabel, tarotDayPickFromKey } from "@/lib/tarot-day";

export const runtime = "nodejs";

const BG = "#141026";
const INK = "#f6f1e7";
const ACCENT = "#d9b26a";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const pick = tarotDayPickFromKey(key);
  if (!pick) return new Response("Not found", { status: 404 });

  const artworkPath = tarotCardArtworkPath(pick.card);
  let artwork: string;
  try {
    // `artworkPath` собран из данных колоды, а не из ключа URL: в путь попадают
    // только `major-NN` и `<масть>-NN`, поэтому выйти за `public/tarot`
    // подставленным ключом нельзя.
    const bytes = await readFile(path.join(process.cwd(), "public", artworkPath));
    artwork = `data:image/jpeg;base64,${bytes.toString("base64")}`;
  } catch {
    return new Response("Artwork missing", { status: 404 });
  }

  const orientation = tarotDayOrientationLabel(pick.reversed);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "56px 48px",
          background: `radial-gradient(circle at 50% 18%, #2a2145 0%, ${BG} 62%)`,
          color: INK,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: 30, fontWeight: 700 }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "999px",
              background: `radial-gradient(circle at 42% 38%, #f3dcae 0%, ${ACCENT} 52%, #6d5bb0 100%)`,
            }}
          />
          ETerapy · карта дня
        </div>

        <div
          style={{
            display: "flex",
            padding: "14px",
            borderRadius: "24px",
            background: "rgba(246,241,231,0.08)",
            border: `2px solid ${ACCENT}`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={artwork}
            alt=""
            width={432}
            height={740}
            style={{
              borderRadius: "12px",
              // Перевёрнутая карта показывается перевёрнутой — это её положение,
              // а не оформление. Подпись ниже дублирует смысл словами, чтобы
              // значение читалось даже там, где картинка не догрузилась.
              //
              // `transform` ставится ТОЛЬКО для перевёрнутой карты: satori не
              // понимает `transform: none` и роняет весь ответ пятисоткой
              // («Only absolute lengths such as 10px are supported»). Прямая
              // карта не должна зависеть от значения, которое ей не нужно.
              ...(pick.reversed ? { transform: "rotate(180deg)" } : {}),
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: "-1px" }}>{pick.card.name}</div>
          <div style={{ fontSize: 28, color: ACCENT }}>{orientation}</div>
        </div>
      </div>
    ),
    {
      width: 1000,
      height: 1200,
      headers: {
        // Ключ полностью описывает содержимое: одна и та же карта в одном и том
        // же положении — всегда одна и та же картинка.
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
