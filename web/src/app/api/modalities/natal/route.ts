import { auth } from "@/lib/auth";
import { checkAndRecordToolSession, getFullReadingPriceKopecks } from "@/lib/tool-limit";
import { NextRequest, NextResponse } from "next/server";
import { aiComplete } from "@/lib/ai";

const zodiacDates = [
  { sign: "Овен", from: [3, 21], to: [4, 19] },
  { sign: "Телец", from: [4, 20], to: [5, 20] },
  { sign: "Близнецы", from: [5, 21], to: [6, 20] },
  { sign: "Рак", from: [6, 21], to: [7, 22] },
  { sign: "Лев", from: [7, 23], to: [8, 22] },
  { sign: "Дева", from: [8, 23], to: [9, 22] },
  { sign: "Весы", from: [9, 23], to: [10, 22] },
  { sign: "Скорпион", from: [10, 23], to: [11, 21] },
  { sign: "Стрелец", from: [11, 22], to: [12, 21] },
  { sign: "Козерог", from: [12, 22], to: [1, 19] },
  { sign: "Водолей", from: [1, 20], to: [2, 18] },
  { sign: "Рыбы", from: [2, 19], to: [3, 20] },
];

function getSunSign(month: number, day: number): string {
  for (const z of zodiacDates) {
    const [fm, fd] = z.from;
    const [tm, td] = z.to;
    if (fm <= tm) {
      if ((month === fm && day >= fd) || (month === tm && day <= td) || (month > fm && month < tm)) return z.sign;
    } else {
      if ((month === fm && day >= fd) || (month === tm && day <= td) || month > fm || month < tm) return z.sign;
    }
  }
  return "Козерог";
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  let body: { birthDate?: string; birthTime?: string; birthPlace?: string; tier?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  const tier = body.tier === "full" ? "full" : "quick";
  const toolLimit = await checkAndRecordToolSession(userId, "NATAL", tier);
  if (!toolLimit.allowed) {
    return NextResponse.json(
      { error: toolLimit.error ?? "Лимит исчерпан", balanceKopecks: toolLimit.balanceKopecks },
      { status: 429 }
    );
  }

  try {
    const { birthDate, birthTime, birthPlace } = body;

    if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      return NextResponse.json(
        { error: "Укажите дату рождения (ГГГГ-ММ-ДД)" },
        { status: 400 }
      );
    }

    const [, monthStr, dayStr] = birthDate.split("-");
    const month = parseInt(monthStr);
    const day = parseInt(dayStr);
    const sunSign = getSunSign(month, day);

    const isFull = tier === "full";

    const systemPrompt = isFull
      ? `Ты — профессиональный астролог с 15-летним стажем на платформе ETerapy. Составляешь глубокий анализ натальной карты. Русский язык. Тёплый тон. Даёшь детальный разбор по 5 сферам: личность, эмоции, коммуникация, карьера, отношения. Честно говоришь о пределах расчёта без точного времени.`
      : `Ты — профессиональный астролог на платформе ETerapy. Составь описание натальной карты (упрощённую версию на основе солнечного знака и даты рождения). Русский язык. Тёплый тон. Честно скажи, что для полной натальной карты нужно точное время и место рождения.`;

    const userContent = isFull
      ? `Дата рождения: ${birthDate}
${birthTime ? `Время рождения: ${birthTime}` : "Время не указано"}
${birthPlace ? `Место рождения: ${birthPlace}` : "Место не указано"}
Солнечный знак: ${sunSign}

Проведи детальный анализ натальной карты по 5 сферам:

**☀️ Личность (Ядро):**
[3-4 предложения — солнечный знак, основные черты характера, самооценка]

**🌙 Эмоциональная природа:**
[3-4 предложения — эмоциональные паттерны, интуиция, подсознательные реакции]

**💬 Коммуникация и мышление:**
[2-3 предложения — стиль общения, принятие решений, обучение]

**💼 Карьера и реализация:**
[3-4 предложения — профессиональные склонности, амбиции, стиль работы]

**❤️ Отношения и партнёрство:**
[3-4 предложения — потребности в отношениях, совместимость, паттерны привязанности]

**🌱 Зоны роста:**
[2-3 конкретных рекомендации]

${!birthTime ? "\n⚠️ *Для точного расчёта асцендента, лунного знака и домов необходимо точное время рождения. Данный анализ основан на солнечном знаке.*" : ""}`
      : `Дата рождения: ${birthDate}
${birthTime ? `Время рождения: ${birthTime}` : "Время не указано"}
${birthPlace ? `Место рождения: ${birthPlace}` : "Место не указано"}
Солнечный знак: ${sunSign}

Напиши описание натальной карты:

**☀️ Солнце в знаке ${sunSign}:**
[3-4 предложения — ядро личности, основные качества]

**🌙 Эмоциональная природа:**
[2-3 предложения — предположительные качества на основе знака]

**💫 Сильные стороны:**
[3-4 пункта]

**⚡ Зоны роста:**
[2-3 пункта]

**🔮 Общая рекомендация:**
[2-3 предложения]

${!birthTime ? "\n⚠️ *Для точного расчёта асцендента, лунного знака и домов необходимо точное время рождения. Данное описание основано на солнечном знаке.*" : ""}`;

    const result = await aiComplete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      maxTokens: isFull ? 3000 : 2000,
    });

    return NextResponse.json({
      sunSign,
      birthDate,
      birthTime: birthTime || null,
      birthPlace: birthPlace || null,
      interpretation: result.text,
      model: result.model,
      provider: result.provider,
      tier,
      balanceKopecks: toolLimit.balanceKopecks,
      fullPriceKopecks: getFullReadingPriceKopecks(),
    });
  } catch (error) {
    console.error("[API:natal] Error:", error);
    return NextResponse.json(
      { error: "Произошла ошибка. Попробуйте позже." },
      { status: 500 }
    );
  }
}
