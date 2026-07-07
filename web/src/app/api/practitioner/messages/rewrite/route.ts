/**
 * B478 — тон-переписывание черновика «Сообщения клиенту»: выбор тона
 * ПЕРЕПИСЫВАЕТ текущий черновик через AI (owner-механика, не декорация).
 * POST { text, tone: "warm" | "neutral" | "brief" } → { text }
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { aiComplete } from "@/lib/ai";
import { requestContextFromHeaders } from "@/lib/request-context";

const TONES: Record<string, string> = {
  warm: "тёплый, поддерживающий, человечный",
  neutral: "нейтральный, спокойный, профессиональный",
  brief: "максимально короткий и ясный (3-5 предложений)",
};

export async function POST(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  if (session.user.role !== "PRACTITIONER") return NextResponse.json({ error: "Нет доступа" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, 4000) : "";
  const toneKey = typeof body?.tone === "string" ? body.tone : "";
  const tone = TONES[toneKey];
  if (text.length < 2) return NextResponse.json({ error: "Черновик пуст" }, { status: 400 });
  if (!tone) return NextResponse.json({ error: "Неизвестный тон" }, { status: 400 });

  try {
    const response = await aiComplete({
      feature: "session-summary",
      userId: session.user.id,
      requestId: context.requestId,
      maxTokens: 900,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: [
            "Перепиши сообщение специалиста клиенту ETerapy в заданном тоне.",
            `Тон: ${tone}.`,
            "Сохрани смысл и договорённости. Русский язык. Без диагнозов и категоричных обещаний.",
            "Верни ТОЛЬКО переписанный текст, без пояснений и кавычек.",
          ].join(" "),
        },
        { role: "user", content: text },
      ],
    });
    const rewritten = response.text?.trim();
    if (!rewritten) throw new Error("empty");
    return NextResponse.json({ ok: true, text: rewritten });
  } catch {
    return NextResponse.json({ error: "Не удалось переписать черновик — попробуйте ещё раз" }, { status: 502 });
  }
}
