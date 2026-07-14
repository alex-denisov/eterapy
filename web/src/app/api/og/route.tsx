// B390 (M26) — генератор OG-картинок для шеринга артефактов. Картинка
// БРЕНДОВО-ДЕКОРАТИВНАЯ (мотив по типу артефакта), без кириллицы внутри —
// конкретный русский текст артефакта едет в og:title/og:description и рисуется
// самой соцсетью (идеальная кириллица, без зависимости от шрифта в satori).

import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

// Латинская подпись-тег (кириллицу в картинку не кладём — satori её не рисует;
// конкретный русский текст артефакта идёт в og:title/og:description).
const KIND_TAG: Record<string, string> = {
  library: "library",
  "human-design": "human design",
  "surname-story": "surname story",
  "weekly-summary": "weekly",
  insight: "insight",
};

function Bodygraph() {
  const dots = [
    { x: 70, y: 0 }, { x: 70, y: 60 }, { x: 70, y: 120 },
    { x: 70, y: 190 }, { x: 130, y: 195 },
    { x: 18, y: 250 }, { x: 122, y: 250 }, { x: 70, y: 255 }, { x: 70, y: 320 },
  ];
  return (
    <div style={{ display: "flex", position: "relative", width: 200, height: 340 }}>
      {dots.map((d, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: d.x,
            top: d.y,
            width: 40,
            height: 40,
            borderRadius: 10,
            background: i % 2 === 0 ? "#b5623f" : "rgba(181,98,63,0.25)",
            border: "3px solid #b5623f",
          }}
        />
      ))}
    </div>
  );
}

function Wheel() {
  return (
    <div style={{ display: "flex", width: 300, height: 300, borderRadius: 150, border: "10px solid rgba(181,98,63,0.35)", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", width: 180, height: 180, borderRadius: 90, border: "6px solid rgba(181,98,63,0.5)" }} />
    </div>
  );
}

function Quote() {
  return (
    <div style={{ display: "flex", fontSize: 300, color: "rgba(181,98,63,0.4)", fontWeight: 700, lineHeight: 1 }}>“</div>
  );
}

function Week() {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} style={{ width: 34, height: 34, borderRadius: 9, background: i < 4 ? "#b5623f" : "rgba(181,98,63,0.25)", border: "3px solid #b5623f" }} />
      ))}
    </div>
  );
}

// B515: мотив кармического кода — печать с кольцом 22 Арканов и ядром числа.
function LineageSeal() {
  return (
    <div style={{ display: "flex", width: 310, height: 310, borderRadius: 155, border: "5px solid rgba(119,52,55,0.32)", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 20px rgba(181,98,63,0.08), inset 0 0 50px rgba(181,98,63,0.12)" }}>
      <div style={{ display: "flex", width: 230, height: 230, borderRadius: 115, border: "3px dashed rgba(181,98,63,0.55)", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", width: 136, height: 136, borderRadius: 68, border: "4px solid rgba(111,139,108,0.55)", background: "rgba(255,250,245,0.88)", color: "#773437", alignItems: "center", justifyContent: "center", fontSize: 76, fontWeight: 650 }}>9</div>
      </div>
    </div>
  );
}

function motifFor(kind: string) {
  if (kind === "human-design") return <Bodygraph />;
  if (kind === "surname-story") return <LineageSeal />;
  if (kind === "weekly-summary") return <Week />;
  if (kind === "insight") return <Quote />;
  return <Wheel />;
}

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind") ?? "library";
  const tag = KIND_TAG[kind] ?? KIND_TAG.library;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #fbf0e1 0%, #f4d9c1 55%, #e8c4b8 100%)",
          color: "#5a2a22",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", fontSize: 52, fontWeight: 700, letterSpacing: -1 }}>ETerapy</div>
          <div style={{ display: "flex", fontSize: 26, color: "#b5623f", textTransform: "uppercase", letterSpacing: 4 }}>{tag}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 640 }}>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 600, lineHeight: 1.1 }}>clarity, gently</div>
            <div style={{ display: "flex", fontSize: 30, color: "#7a4a3a", marginTop: 18 }}>understand your situation in minutes</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{motifFor(kind)}</div>
        </div>

        <div style={{ display: "flex", fontSize: 24, color: "#b5623f" }}>eterapy.com · {KIND_TAG[kind] ?? "library"}</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
