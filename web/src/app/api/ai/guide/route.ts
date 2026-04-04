import { auth } from "@/lib/auth";
import { checkAndRecordToolSession } from "@/lib/tool-limit";
import { NextRequest, NextResponse } from "next/server";
import { aiComplete } from "@/lib/ai";

export async function POST(req: NextRequest) {
  const session = await auth();
  // @ts-expect-error custom
  const userId = session?.user?.id ?? null;
  const toolLimit = await checkAndRecordToolSession(userId, "GUIDE");
  if (!toolLimit.allowed) {
    return NextResponse.json({ error: "Лимит инструментов исчерпан" }, { status: 429 });
  }

  try {
    const { topic, context } = await req.json();

    if (!topic || typeof topic !== "string" || topic.length > 300) {
      return NextResponse.json(
        { error: "Укажите тему (макс. 300 символов)" },
        { status: 400 }
      );
    }

    const result = await aiComplete({
      messages: [
        {
          role: "system",
          content: `Ты — мудрый наставник на платформе ETerapy. Создай персональный мини-гид по запросу пользователя. Русский язык. Тёплый, но не навязчивый тон. Никаких медицинских/юридических советов. Формат — структурированный текст с эмодзи-заголовками.`,
        },
        {
          role: "user",
          content: `Тема запроса: "${topic}"
${context ? `Дополнительный контекст: "${context}"` : ""}

Создай персональный мини-гид:

**📌 О чём это:**
[1-2 предложения — суть запроса, как ты его понимаешь]

**🔍 Что стоит осознать:**
[3-4 пункта — инсайты по теме]

**🛤️ Пошаговый план:**
[3-5 конкретных шагов]

**🌟 Аффирмация дня:**
[1 аффирмация, связанная с темой]

**📚 Что почитать / попробовать:**
[2-3 рекомендации — книги, практики, медитации]`,
        },
      ],
      maxTokens: 2000,
    });

    return NextResponse.json({
      topic,
      guide: result.text,
      model: result.model,
      provider: result.provider,
    });
  } catch (error) {
    console.error("[API:guide] Error:", error);
    return NextResponse.json(
      { error: "Произошла ошибка. Попробуйте позже." },
      { status: 500 }
    );
  }
}
