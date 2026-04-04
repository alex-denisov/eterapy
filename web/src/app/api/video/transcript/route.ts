import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

const PLATFORM_RULES = `
Правила платформы ETerapy:
1. Запрещено запугивание и угрозы
2. Запрещены манипуляции и давление
3. Запрещены гарантии результата ("это точно произойдёт", "100% гарантия")
4. Запрещены агрессивные допродажи во время сессии
5. Запрещены оскорбления и дискриминация
6. Запрещён сбор личных данных клиента (адрес, паспорт и т.д.)
7. Запрещены контакты вне платформы без явного согласия клиента
`;

const VIOLATION_PATTERNS = [
  /умрёшь|умрете|проклятие|порча|сглаз/i,
  /гарантирую|точно произойдёт|100%|обязательно случится/i,
  /переведите деньги|оплатите сейчас|скидка только сегодня/i,
  /ваш адрес|паспорт|СНИЛС|ИНН/i,
  /пишите мне в телеграм|мой номер телефона|напишите лично/i,
];

async function checkViolations(text: string): Promise<string | null> {
  // Быстрая проверка по паттернам
  for (const pattern of VIOLATION_PATTERNS) {
    if (pattern.test(text)) {
      return `Обнаружено потенциальное нарушение правил платформы. Убедитесь в этичности консультации.`;
    }
  }

  // GPT-проверка если есть API ключ
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey || text.length < 50) return null;

  try {
    const baseURL = process.env.OPENROUTER_API_KEY
      ? "https://openrouter.ai/api/v1"
      : "https://api.openai.com/v1";

    const res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_API_KEY ? "openrouter/free" : "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Ты модератор платформы онлайн-консультаций. Анализируй текст на нарушения правил.\n\n${PLATFORM_RULES}\n\nОтвечай ТОЛЬКО в формате JSON: {"violation": true/false, "reason": "краткое описание или null"}`,
          },
          { role: "user", content: `Транскрипт последних 30 секунд: "${text.slice(-500)}"` },
        ],
        max_tokens: 100,
        temperature: 0,
      }),
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(content.match(/\{.*\}/s)?.[0] ?? "{}");
    if (parsed.violation && parsed.reason) return parsed.reason;
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

  // Если финальный транскрипт — сохраняем в БД
  if (isFinal) {
    await db.videoSession.update({
      where: { id: videoSessionId },
      data: { transcriptText: text },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, violation });
}

/** POST /api/video/transcript/summarize — AI резюме для практика */
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  // @ts-expect-error custom
  if (session.user?.role !== "PRACTITIONER") {
    return NextResponse.json({ error: "Только для практиков" }, { status: 403 });
  }

  const { videoSessionId } = await req.json();
  const vs = await db.videoSession.findUnique({ where: { id: videoSessionId } });
  if (!vs?.transcriptText) {
    return NextResponse.json({ error: "Транскрипт недоступен" }, { status: 404 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI не настроен" }, { status: 503 });

  const baseURL = process.env.OPENROUTER_API_KEY
    ? "https://openrouter.ai/api/v1"
    : "https://api.openai.com/v1";

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENROUTER_API_KEY ? "openrouter/free" : "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Ты помощник для практиков эзотерики. Составь структурированное резюме консультации на русском языке: ключевые темы, запросы клиента, данные советы, дальнейшие шаги. Формат: Markdown.",
        },
        { role: "user", content: vs.transcriptText },
      ],
      max_tokens: 1000,
    }),
  });

  const data = await res.json();
  const summary = data.choices?.[0]?.message?.content ?? "";

  await db.videoSession.update({ where: { id: videoSessionId }, data: { summaryText: summary } });

  return NextResponse.json({ ok: true, summary });
}
