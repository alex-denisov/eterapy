import { auth } from "@/lib/auth";
import { checkAndRecordToolSession } from "@/lib/tool-limit-server";
import { getFullReadingPriceKopecks } from "@/lib/tool-limit";
import { NextRequest, NextResponse } from "next/server";
import { aiComplete } from "@/lib/ai";

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  let body: { answers?: string[]; tier?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  const tier = body.tier === "full" ? "full" : "quick";
  const toolLimit = await checkAndRecordToolSession(userId, "CHECKIN", tier);
  if (!toolLimit.allowed) {
    return NextResponse.json(
      { error: toolLimit.error ?? "Лимит исчерпан", balanceKopecks: toolLimit.balanceKopecks },
      { status: 429 }
    );
  }

  try {
    const { answers } = body;
    if (!answers || !Array.isArray(answers) || answers.length < 3) {
      return NextResponse.json({ error: "Необходимо минимум 3 ответа" }, { status: 400 });
    }

    const isFull = tier === "full";
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

    const systemPrompt = isFull
      ? `Ты — опытный рефлексивный консультант с навыками коучинга. Проводишь глубинный анализ состояния клиента ETerapy.
Правила: русский язык, тёплый тон, никаких диагнозов, детальный анализ по 5 сферам, конкретные рекомендации.`
      : `Ты — мудрый и тёплый консультант на платформе ETerapy. Пользователь прошёл рефлексивный check-in.
Правила: русский язык, тёплый тон, никаких диагнозов или медицинских советов, не обещай результатов.`;

    const userContent = isFull
      ? `Ответы пользователя:\n\n${answersBlock}\n\nДай детальный анализ:\n1. 🔍 Что я вижу (паттерны по ответам)\n2. 💡 Анализ по сферам: Эмоции, Отношения, Карьера, Здоровье, Духовный рост\n3. 🌱 Конкретные шаги на неделю\n4. 💪 Источник сил и опоры`
      : `Ответы пользователя:\n\n${answersBlock}\n\nДай структурированный ответ:\n\n**🔍 Что я вижу:** [наблюдения]\n\n**💡 На что стоит обратить внимание:** [инсайты]\n\n**🌱 Маленький шаг:** [действие на сегодня]`;

    const result = await aiComplete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      maxTokens: isFull ? 3000 : 2000,
    });

    return NextResponse.json({
      result: result.text,
      model: result.model,
      provider: result.provider,
      tier,
      balanceKopecks: toolLimit.balanceKopecks,
      fullPriceKopecks: getFullReadingPriceKopecks(),
    });
  } catch (error) {
    console.error("[API:checkin] Error:", error);
    return NextResponse.json({ error: "Произошла ошибка. Попробуйте позже." }, { status: 500 });
  }
}
