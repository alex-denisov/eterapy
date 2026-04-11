import { auth } from "@/lib/auth";
import { checkAndRecordToolSession, getFullReadingPriceKopecks } from "@/lib/tool-limit";
import { NextRequest, NextResponse } from "next/server";
import { aiComplete } from "@/lib/ai";

const zodiacSigns = [
  "Овен", "Телец", "Близнецы", "Рак", "Лев", "Дева",
  "Весы", "Скорпион", "Стрелец", "Козерог", "Водолей", "Рыбы",
] as const;

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  let body: { sign?: string; period?: string; tier?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  const tier = body.tier === "full" ? "full" : "quick";
  const toolLimit = await checkAndRecordToolSession(userId, "HOROSCOPE", tier);
  if (!toolLimit.allowed) {
    return NextResponse.json(
      { error: toolLimit.error ?? "Лимит исчерпан", balanceKopecks: toolLimit.balanceKopecks },
      { status: 429 }
    );
  }

  try {
    const { sign, period = "daily" } = body;

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

    const isFull = tier === "full";

    const systemPrompt = isFull
      ? `Ты — опытный астролог на платформе ETerapy. Составляешь детальный персональный гороскоп с учётом текущих астрологических транзитов. Русский язык. Тёплый тон. Никаких гарантий результатов. Анализируешь 5 сфер + лунный календарь.`
      : `Ты — астролог на платформе ETerapy. Составь персонализированный гороскоп. Русский язык. Тёплый тон. Никаких гарантий результатов. Учитывай текущие астрологические транзиты (общие).`;

    const userContent = isFull
      ? `Знак зодиака: ${sign}
Период: ${periodLabels[period] || "на сегодня"}
Дата: ${new Date().toISOString().split("T")[0]}

Составь детальный гороскоп по 5 сферам + лунный календарь:

**☀️ Общая энергия периода:**
[3-4 предложения — ключевые тенденции, основные аспекты]

**💕 Любовь и отношения:**
[3-4 предложения — романтические тенденции, совместимость, советы]

**💼 Карьера и финансы:**
[3-4 предложения — профессиональные возможности, финансовые рекомендации]

**🌿 Здоровье и энергия:**
[2-3 предложения — уровень энергии, на что обратить внимание]

**🌱 Личностный рост:**
[2-3 предложения — возможности для развития, внутренние процессы]

**🌙 Лунный календарь:**
[2-3 предложения — текущая лунная фаза, благоприятные дни, рекомендации]

**⭐ Благоприятные дни:**
[перечисли 2-3 конкретных дня периода]`
      : `Знак зодиака: ${sign}
Период: ${periodLabels[period] || "на сегодня"}
Дата: ${new Date().toISOString().split("T")[0]}

Напиши гороскоп в формате:

**☀️ Общая энергия:** [2-3 предложения]
**💕 Любовь и отношения:** [2 предложения]
**💼 Карьера и финансы:** [2 предложения]
**🌱 Совет дня:** [1 конкретный совет]`;

    const result = await aiComplete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      maxTokens: isFull ? 3000 : 2000,
    });

    return NextResponse.json({
      sign,
      period,
      date: new Date().toISOString().split("T")[0],
      horoscope: result.text,
      model: result.model,
      provider: result.provider,
      tier,
      balanceKopecks: toolLimit.balanceKopecks,
      fullPriceKopecks: getFullReadingPriceKopecks(),
    });
  } catch (error) {
    console.error("[API:horoscope] Error:", error);
    return NextResponse.json(
      { error: "Произошла ошибка. Попробуйте позже." },
      { status: 500 }
    );
  }
}
