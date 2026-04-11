import { auth } from "@/lib/auth";
import { checkAndRecordToolSession, getFullReadingPriceKopecks } from "@/lib/tool-limit";
import { NextRequest, NextResponse } from "next/server";
import { aiComplete } from "@/lib/ai";
import { lifePathNumber, lifePathMeanings } from "@/data/numerology";

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  let body: { birthDate?: string; name?: string; tier?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  const tier = body.tier === "full" ? "full" : "quick";
  const toolLimit = await checkAndRecordToolSession(userId, "NUMEROLOGY", tier);
  if (!toolLimit.allowed) {
    return NextResponse.json(
      { error: toolLimit.error ?? "Лимит исчерпан", balanceKopecks: toolLimit.balanceKopecks },
      { status: 429 }
    );
  }

  try {
    const { birthDate, name } = body;

    if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      return NextResponse.json(
        { error: "Укажите дату рождения в формате ГГГГ-ММ-ДД" },
        { status: 400 }
      );
    }

    const lpn = lifePathNumber(birthDate);
    const meaning = lifePathMeanings[lpn];

    const isFull = tier === "full";

    const systemPrompt = isFull
      ? `Ты — опытный нумеролог с глубоким знанием системы Пифагора. Проводишь детальный нумерологический анализ для клиентов ETerapy. Русский язык. Тёплый тон. Не обещай результатов. Анализируешь 5 чисел: жизненный путь, выражение, душа, личность, зрелость.`
      : `Ты — мудрый нумеролог на платформе ETerapy. Интерпретируй число жизненного пути по системе Пифагора. Русский язык. Тёплый тон. Не обещай результатов.`;

    const userContent = isFull
      ? `Дата рождения: ${birthDate}${name ? `, имя: ${name}` : ""}
Число жизненного пути: ${lpn}
Архетип: ${meaning.title}
Ключевые слова: ${meaning.keywords.join(", ")}

Проведи детальный нумерологический анализ:

**🛤️ Жизненный путь (${lpn}):**
[3-4 предложения — основное предназначение, ключевые уроки жизни]

**✨ Число выражения:**
[2-3 предложения — таланты, способности, как вы проявляетесь в мире]

**💜 Число души:**
[2-3 предложения — внутренние желания, мотивация, что по-настоящему важно]

**🎭 Число личности:**
[2-3 предложения — как вас видят окружающие, внешнее проявление]

**🌳 Число зрелости:**
[2-3 предложения — qualities, развивающиеся с возрастом, вторая половина жизни]

**🌱 Синтез и рекомендации:**
[2-3 конкретных совета по интеграции всех чисел]`
      : `Дата рождения: ${birthDate}${name ? `, имя: ${name}` : ""}
Число жизненного пути: ${lpn}
Архетип: ${meaning.title}
Ключевые слова: ${meaning.keywords.join(", ")}

Дай развёрнутую интерпретацию (5-7 предложений): что означает это число, какие сильные стороны, на что обратить внимание, как проявляется в жизни.`;

    const result = await aiComplete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      maxTokens: isFull ? 3000 : 2000,
    });

    return NextResponse.json({
      lifePathNumber: lpn,
      archetype: meaning.title,
      keywords: meaning.keywords,
      interpretation: result.text,
      model: result.model,
      provider: result.provider,
      tier,
      balanceKopecks: toolLimit.balanceKopecks,
      fullPriceKopecks: getFullReadingPriceKopecks(),
    });
  } catch (error) {
    console.error("[API:numerology] Error:", error);
    return NextResponse.json(
      { error: "Произошла ошибка. Попробуйте позже." },
      { status: 500 }
    );
  }
}
