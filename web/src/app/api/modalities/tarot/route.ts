import { NextRequest, NextResponse } from "next/server";
import { aiComplete } from "@/lib/ai";
import { drawCards } from "@/data/tarot-cards";
import { auth } from "@/lib/auth";
import { checkAndRecordToolSession, getFullReadingPriceKopecks } from "@/lib/tool-limit";

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  let body: { question?: string; tier?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  const tier = body.tier === "full" ? "full" : "quick";
  const limit = await checkAndRecordToolSession(userId, "TAROT", tier);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: limit.error ?? "Лимит исчерпан", balanceKopecks: limit.balanceKopecks },
      { status: 429 }
    );
  }

  try {
    const { question } = body;

    if (!question || typeof question !== "string" || question.length > 500) {
      return NextResponse.json(
        { error: "Вопрос обязателен (макс. 500 символов)" },
        { status: 400 }
      );
    }

    const isFull = tier === "full";
    const cardCount = isFull ? 5 : 3;
    const positions = isFull
      ? ["Прошлое", "Настоящее", "Скрытое влияние", "Совет карт", "Итог"]
      : ["Прошлое", "Настоящее", "Будущее"];

    const cards = drawCards(cardCount);

    const cardsDescription = cards
      .map((card, i) => {
        const orientation = card.reversed ? "перевёрнута" : "прямая";
        const kw = card.reversed
          ? card.keywordsReversed.join(", ")
          : card.keywords.join(", ");
        return `Позиция ${i + 1} (${positions[i]}): ${card.nameRu} (${card.name}), ${orientation}. Ключевые слова: ${kw}.`;
      })
      .join("\n");

    const systemPrompt = isFull
      ? `Ты — опытный таролог с 15-летним стажем. Проводишь глубинные расклады для клиентов ETerapy.

Правила:
- Говори на русском языке
- Будь тёплым, эмпатичным, как мудрая подруга
- Используй «я вижу в вашем раскладе», «карты говорят мне», «я чувствую»
- Никогда не запугивай и не обещай конкретных результатов
- Давай детальный анализ каждой позиции (3-4 предложения)
- Анализируй 5 сфер: любовь, карьера, здоровье, финансы, духовный рост
- Добавляй конкретные рекомендации и ориентиры по времени («в ближайшие 2-4 недели»)
- Дисклеймер НЕ нужен`
      : `Ты — мудрый и тёплый таролог на платформе ETerapy. Интерпретируй расклад из 3 карт Таро Райдера-Уэйта.

Правила:
- Говори на русском языке
- Будь тёплым, но не навязчивым
- Никогда не запугивай и не обещай конкретных результатов
- Используй мягкие формулировки ("карты предлагают обратить внимание", "стоит задуматься")
- Дисклеймер НЕ нужен`;

    const userPrompt = isFull
      ? `Вопрос клиента: "${question}"

Расклад: Кельтский мини-крест (5 карт)
${cardsDescription}

Дай детальный расклад:
1. Интерпретация каждой карты в контексте позиции (3-4 предложения)
2. Анализ по сферам: Любовь, Карьера, Здоровье, Финансы, Духовный рост
3. Что карты советуют (конкретные рекомендации)
4. На что обратить внимание в ближайшие 2-4 недели
5. Тёплое завершение`
      : `Вопрос клиента: "${question}"

Расклад:
${cardsDescription}

Дай интерпретацию каждой карты в контексте позиции и вопроса (2-3 предложения на карту), затем общий вывод (2-3 предложения).

Формат:
1. **${cards[0].nameRu}** (${positions[0]}): ...
2. **${cards[1].nameRu}** (${positions[1]}): ...
3. **${cards[2].nameRu}** (${positions[2]}): ...

**Общий вывод:** ...`;

    const result = await aiComplete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: isFull ? 3000 : 2000,
    });

    return NextResponse.json({
      cards: cards.map((c, i) => ({
        name: c.nameRu,
        nameEn: c.name,
        position: positions[i],
        reversed: c.reversed,
        keywords: c.reversed ? c.keywordsReversed : c.keywords,
      })),
      interpretation: result.text,
      model: result.model,
      provider: result.provider,
      tier,
      balanceKopecks: limit.balanceKopecks,
      fullPriceKopecks: getFullReadingPriceKopecks(),
    });
  } catch (error) {
    console.error("[API:tarot] Error:", error);
    return NextResponse.json(
      { error: "Произошла ошибка. Попробуйте позже." },
      { status: 500 }
    );
  }
}
