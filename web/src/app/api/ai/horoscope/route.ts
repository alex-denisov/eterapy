import { auth } from "@/lib/auth";
import { checkAndRecordToolSession } from "@/lib/tool-limit";
import { NextRequest, NextResponse } from "next/server";
import { aiComplete } from "@/lib/ai";

const zodiacSigns = [
  "Овен", "Телец", "Близнецы", "Рак", "Лев", "Дева",
  "Весы", "Скорпион", "Стрелец", "Козерог", "Водолей", "Рыбы",
] as const;

export async function POST(req: NextRequest) {
  const session = await auth();
  // @ts-expect-error custom
  const userId = session?.user?.id ?? null;
  const toolLimit = await checkAndRecordToolSession(userId, "HOROSCOPE");
  if (!toolLimit.allowed) {
    return NextResponse.json({ error: "Лимит инструментов исчерпан" }, { status: 429 });
  }

  try {
    const { sign, period = "daily" } = await req.json();

    if (!sign || !zodiacSigns.includes(sign)) {
      return NextResponse.json(
        { error: `Укажите знак зодиака: ${zodiacSigns.join(", ")}` },
        { status: 400 }
      );
    }

    const periodLabels: Record<string, string> = {
      daily: "на сегодня",
      weekly: "на эту неделю",
      monthly: "на этот месяц",
    };

    const result = await aiComplete({
      messages: [
        {
          role: "system",
          content: `Ты — астролог на платформе ETerapy. Составь персонализированный гороскоп. Русский язык. Тёплый тон. Никаких гарантий результатов. Учитывай текущие астрологические транзиты (общие).`,
        },
        {
          role: "user",
          content: `Знак зодиака: ${sign}
Период: ${periodLabels[period] || "на сегодня"}
Дата: ${new Date().toISOString().split("T")[0]}

Напиши гороскоп в формате:

**☀️ Общая энергия:** [2-3 предложения]
**💕 Любовь и отношения:** [2 предложения]
**💼 Карьера и финансы:** [2 предложения]
**🌱 Совет дня:** [1 конкретный совет]`,
        },
      ],
      maxTokens: 500,
    });

    return NextResponse.json({
      sign,
      period,
      date: new Date().toISOString().split("T")[0],
      horoscope: result.text,
      model: result.model,
      provider: result.provider,
    });
  } catch (error) {
    console.error("[API:horoscope] Error:", error);
    return NextResponse.json(
      { error: "Произошла ошибка. Попробуйте позже." },
      { status: 500 }
    );
  }
}
