import { NextRequest, NextResponse } from "next/server";
import { aiComplete } from "@/lib/ai";
import { drawCards } from "@/data/tarot-cards";

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json();

    if (!question || typeof question !== "string" || question.length > 500) {
      return NextResponse.json(
        { error: "Вопрос обязателен (макс. 500 символов)" },
        { status: 400 }
      );
    }

    const cards = drawCards(3);
    const positions = ["Прошлое", "Настоящее", "Будущее"];

    const cardsDescription = cards
      .map((card, i) => {
        const orientation = card.reversed ? "перевёрнута" : "прямая";
        const kw = card.reversed
          ? card.keywordsReversed.join(", ")
          : card.keywords.join(", ");
        return `Позиция ${i + 1} (${positions[i]}): ${card.nameRu} (${card.name}), ${orientation}. Ключевые слова: ${kw}.`;
      })
      .join("\n");

    const result = await aiComplete({
      messages: [
        {
          role: "system",
          content: `Ты — мудрый и тёплый таролог на платформе ETerapy. Интерпретируй расклад из 3 карт Таро Райдера-Уэйта.

Правила:
- Говори на русском языке
- Будь тёплым, но не навязчивым
- Никогда не запугивай и не обещай конкретных результатов
- Используй мягкие формулировки ("карты предлагают обратить внимание", "стоит задуматься")
- Дисклеймер НЕ нужен (он есть на странице)`,
        },
        {
          role: "user",
          content: `Вопрос клиента: "${question}"

Расклад:
${cardsDescription}

Дай интерпретацию каждой карты в контексте позиции и вопроса (2-3 предложения на карту), затем общий вывод (2-3 предложения).

Формат:
1. **${cards[0].nameRu}** (${positions[0]}): ...
2. **${cards[1].nameRu}** (${positions[1]}): ...
3. **${cards[2].nameRu}** (${positions[2]}): ...

**Общий вывод:** ...`,
        },
      ],
      maxTokens: 800,
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
    });
  } catch (error) {
    console.error("[API:tarot] Error:", error);
    return NextResponse.json(
      { error: "Произошла ошибка. Попробуйте позже." },
      { status: 500 }
    );
  }
}
