import { auth } from "@/lib/auth";
import { checkAndRecordToolSession, getFullReadingPriceKopecks } from "@/lib/tool-limit";
import { NextRequest, NextResponse } from "next/server";
import { aiComplete } from "@/lib/ai";

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  let body: { topic?: string; context?: string; tier?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  const tier = body.tier === "full" ? "full" : "quick";
  const toolLimit = await checkAndRecordToolSession(userId, "GUIDE", tier);
  if (!toolLimit.allowed) {
    return NextResponse.json(
      { error: toolLimit.error ?? "Лимит исчерпан", balanceKopecks: toolLimit.balanceKopecks },
      { status: 429 }
    );
  }

  try {
    const { topic, context } = body;

    if (!topic || typeof topic !== "string" || topic.length > 300) {
      return NextResponse.json(
        { error: "Укажите тему (макс. 300 символов)" },
        { status: 400 }
      );
    }

    const isFull = tier === "full";

    const systemPrompt = isFull
      ? `Ты — мудрый наставник и коуч на платформе ETerapy. Создаёшь расширенный персональный гид с практическими упражнениями. Русский язык. Тёплый, но не навязчивый тон. Никаких медицинских/юридических советов. Структурированный формат с эмодзи-заголовками.`
      : `Ты — мудрый наставник на платформе ETerapy. Создай персональный мини-гид по запросу пользователя. Русский язык. Тёплый, но не навязчивый тон. Никаких медицинских/юридических советов. Формат — структурированный текст с эмодзи-заголовками.`;

    const userContent = isFull
      ? `Тема запроса: "${topic}"
${context ? `Дополнительный контекст: "${context}"` : ""}

Создай расширенный персональный гид с практическими упражнениями:

**📌 О чём это:**
[2-3 предложения — суть запроса, как ты его понимаешь]

**🔍 Ключевые аспекты:**
[4-5 пунктов — глубинные инсайты по теме]

**🛤️ Пошаговый план:**
[5-7 конкретных шагов с пояснениями]

**🧘 Практические упражнения:**
[3 упражнения — медитация, journaling, визуализация]

**💬 Аффирмации:**
[3 аффирмации, связанные с темой]

**⚠️ Чего избегать:**
[2-3 ловушки и как их обойти]

**📚 Рекомендации:**
[3-4 рекомендации — книги, подкасты, практики, курсы]`
      : `Тема запроса: "${topic}"
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
[2-3 рекомендации — книги, практики, медитации]`;

    const result = await aiComplete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      maxTokens: isFull ? 3000 : 2000,
    });

    return NextResponse.json({
      topic,
      guide: result.text,
      model: result.model,
      provider: result.provider,
      tier,
      balanceKopecks: toolLimit.balanceKopecks,
      fullPriceKopecks: getFullReadingPriceKopecks(),
    });
  } catch (error) {
    console.error("[API:guide] Error:", error);
    return NextResponse.json(
      { error: "Произошла ошибка. Попробуйте позже." },
      { status: 500 }
    );
  }
}
