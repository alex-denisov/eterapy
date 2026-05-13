import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { aiComplete } from "@/lib/ai";

const PLATFORM_RULES = `Правила платформы ETerapy:
1. Запрещено запугивание и угрозы
2. Запрещены манипуляции и давление
3. Запрещены гарантии результата ("это точно произойдёт", "100% гарантия")
4. Запрещены агрессивные допродажи во время сессии
5. Запрещены оскорбления и дискриминация
6. Запрещён сбор личных данных клиента (адрес, паспорт и т.д.)
7. Запрещены контакты вне платформы без явного согласия клиента`;

const VIOLATION_PATTERNS = [
  /умрёшь|умрете|проклятие|порча|сглаз/i,
  /гарантирую|точно произойдёт|100%|обязательно случится/i,
  /переведите деньги|оплатите сейчас|скидка только сегодня/i,
  /ваш адрес|паспорт|СНИЛС|ИНН/i,
  /пишите мне в телеграм|мой номер телефона|напишите лично/i,
];

async function checkViolations(text: string): Promise<string | null> {
  // Быстрая проверка по паттернам — без API
  for (const pattern of VIOLATION_PATTERNS) {
    if (pattern.test(text)) {
      return "Обнаружено потенциальное нарушение правил платформы. Убедитесь в этичности консультации.";
    }
  }

  if (text.length < 50) return null;

  try {
    const result = await aiComplete({
      feature: "session-compliance",
      messages: [
        {
          role: "system",
          content: `Ты модератор платформы онлайн-консультаций. Анализируй текст на нарушения правил.\n\n${PLATFORM_RULES}\n\nОтвечай ТОЛЬКО в формате JSON: {"violation": true/false, "reason": "краткое описание или null"}`,
        },
        { role: "user", content: `Транскрипт последних 30 секунд: "${text.slice(-500)}"` },
      ],
      maxTokens: 150,
      temperature: 0,
    });
    const parsed = JSON.parse(result.text.match(new RegExp("\\{[^]*\\}"))?.[0] ?? "{}");
    if (parsed.violation && parsed.reason) return String(parsed.reason);
  } catch { /* ignore */ }

  return null;
}

/** POST /api/video/transcript — анализ транскрипта на нарушения */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  const { videoSessionId, text, isFinal } = await req.json();
  if (!videoSessionId || !text) return NextResponse.json({ error: "Данные неполны" }, { status: 400 });

  const violation = await checkViolations(text);

  if (isFinal) {
    await db.videoSession.update({
      where: { id: videoSessionId },
      data: { transcriptText: text },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, violation });
}

/** PUT /api/video/transcript — AI резюме сессии для практика */
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  if (session.user?.role !== "PRACTITIONER") {
    return NextResponse.json({ error: "Только для практиков" }, { status: 403 });
  }

  const { videoSessionId } = await req.json();
  const vs = await db.videoSession.findUnique({ where: { id: videoSessionId } });
  if (!vs?.transcriptText) {
    return NextResponse.json({ error: "Транскрипт недоступен" }, { status: 404 });
  }

  try {
    const result = await aiComplete({
      feature: "session-summary",
      messages: [
        {
          role: "system",
          content: "Ты помощник для практиков эзотерики. Составь структурированное резюме консультации на русском языке: ключевые темы, запросы клиента, данные советы, дальнейшие шаги. Формат: Markdown.",
        },
        { role: "user", content: vs.transcriptText },
      ],
      maxTokens: 1500,
    });

    const summary = result.text;
    await db.videoSession.update({ where: { id: videoSessionId }, data: { summaryText: summary } });
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка AI";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
