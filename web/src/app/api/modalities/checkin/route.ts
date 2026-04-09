import { auth } from "@/lib/auth";
import { checkAndRecordToolSession } from "@/lib/tool-limit";
import { NextRequest, NextResponse } from "next/server";
import { aiComplete } from "@/lib/ai";

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const toolLimit = await checkAndRecordToolSession(userId, "CHECKIN");
  if (!toolLimit.allowed) {
    return NextResponse.json({ error: "Лимит инструментов исчерпан" }, { status: 429 });
  }

  try {
    const { answers } = await req.json();

    if (!answers || !Array.isArray(answers) || answers.length < 3) {
      return NextResponse.json(
        { error: "Необходимо минимум 3 ответа" },
        { status: 400 }
      );
    }

    const questionsText = [
      "Что сейчас занимает ваши мысли больше всего?",
      "Какую эмоцию вы чувствуете чаще всего в последнее время?",
      "Если бы вы могли изменить одну вещь в ближайшие 30 дней, что бы это было?",
      "Что даёт вам силы, когда трудно?",
      "Что вы откладываете, но знаете что это важно?",
    ];

    const answersBlock = answers
      .map((a: string, i: number) => `${i + 1}. ${questionsText[i]}\n"${a}"`)
      .join("\n\n");

    const result = await aiComplete({
      messages: [
        {
          role: "system",
          content: `Ты — мудрый и тёплый консультант на платформе ETerapy. Пользователь прошёл рефлексивный check-in.

Правила:
- Русский язык
- Тёплый, но не навязчивый тон
- Никаких диагнозов или медицинских советов
- Не обещай результатов
- Используй формулировки "возможно", "стоит обратить внимание"`,
        },
        {
          role: "user",
          content: `Ответы пользователя:

${answersBlock}

Дай структурированный ответ:

**🔍 Что я вижу:**
[2-3 предложения — наблюдения по ответам, паттерны]

**💡 На что стоит обратить внимание:**
[2-3 конкретных инсайта]

**🌱 Маленький шаг:**
[1 конкретное действие, которое можно сделать сегодня]`,
        },
      ],
      maxTokens: 2000,
    });

    return NextResponse.json({
      result: result.text,
      model: result.model,
      provider: result.provider,
    });
  } catch (error) {
    console.error("[API:checkin] Error:", error);
    return NextResponse.json(
      { error: "Произошла ошибка. Попробуйте позже." },
      { status: 500 }
    );
  }
}
