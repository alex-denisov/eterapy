import { auth } from "@/lib/auth";
import { checkAndRecordToolSession } from "@/lib/tool-limit";
import { NextRequest, NextResponse } from "next/server";
import { aiComplete } from "@/lib/ai";
import { lifePathNumber, lifePathMeanings } from "@/data/numerology";

export async function POST(req: NextRequest) {
  const session = await auth();
  // @ts-expect-error custom
  const userId = session?.user?.id ?? null;
  const toolLimit = await checkAndRecordToolSession(userId, "NUMEROLOGY");
  if (!toolLimit.allowed) {
    return NextResponse.json({ error: "Лимит инструментов исчерпан" }, { status: 429 });
  }

  try {
    const { birthDate, name } = await req.json();

    if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      return NextResponse.json(
        { error: "Укажите дату рождения в формате ГГГГ-ММ-ДД" },
        { status: 400 }
      );
    }

    const lpn = lifePathNumber(birthDate);
    const meaning = lifePathMeanings[lpn];

    const result = await aiComplete({
      messages: [
        {
          role: "system",
          content: `Ты — мудрый нумеролог на платформе ETerapy. Интерпретируй число жизненного пути по системе Пифагора. Русский язык. Тёплый тон. Не обещай результатов.`,
        },
        {
          role: "user",
          content: `Дата рождения: ${birthDate}${name ? `, имя: ${name}` : ""}
Число жизненного пути: ${lpn}
Архетип: ${meaning.title}
Ключевые слова: ${meaning.keywords.join(", ")}

Дай развёрнутую интерпретацию (5-7 предложений): что означает это число, какие сильные стороны, на что обратить внимание, как проявляется в жизни.`,
        },
      ],
      maxTokens: 600,
    });

    return NextResponse.json({
      lifePathNumber: lpn,
      archetype: meaning.title,
      keywords: meaning.keywords,
      interpretation: result.text,
      model: result.model,
      provider: result.provider,
    });
  } catch (error) {
    console.error("[API:numerology] Error:", error);
    return NextResponse.json(
      { error: "Произошла ошибка. Попробуйте позже." },
      { status: 500 }
    );
  }
}
