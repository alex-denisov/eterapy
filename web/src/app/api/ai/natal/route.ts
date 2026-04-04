import { auth } from "@/lib/auth";
import { checkAndRecordToolSession } from "@/lib/tool-limit";
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
  // @ts-expect-error custom
  const userId = session?.user?.id ?? null;
  const toolLimit = await checkAndRecordToolSession(userId, "NATAL");
  if (!toolLimit.allowed) {
    return NextResponse.json({ error: "Лимит инструментов исчерпан" }, { status: 429 });
  }

  try {
    const { birthDate, birthTime, birthPlace } = await req.json();

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

    const result = await aiComplete({
      messages: [
        {
          role: "system",
          content: `Ты — профессиональный астролог на платформе ETerapy. Составь описание натальной карты (упрощённую версию на основе солнечного знака и даты рождения). Русский язык. Тёплый тон. Честно скажи, что для полной натальной карты нужно точное время и место рождения.`,
        },
        {
          role: "user",
          content: `Дата рождения: ${birthDate}
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

${!birthTime ? "\n⚠️ *Для точного расчёта асцендента, лунного знака и домов необходимо точное время рождения. Данное описание основано на солнечном знаке.*" : ""}`,
        },
      ],
      maxTokens: 800,
    });

    return NextResponse.json({
      sunSign,
      birthDate,
      birthTime: birthTime || null,
      birthPlace: birthPlace || null,
      interpretation: result.text,
      model: result.model,
      provider: result.provider,
    });
  } catch (error) {
    console.error("[API:natal] Error:", error);
    return NextResponse.json(
      { error: "Произошла ошибка. Попробуйте позже." },
      { status: 500 }
    );
  }
}
