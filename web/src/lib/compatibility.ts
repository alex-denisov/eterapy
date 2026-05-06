import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

function normalize(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 9000);
}

export function heuristicCompatibility() {
  return normalize([
    "Разбор совместимости",
    "",
    "1. Точки пересечения",
    "Вы оба стремитесь к стабильности, но понимаете ее по-разному. Один из вас хочет предсказуемости, другой — пространства для маневра.",
    "",
    "2. Зоны напряжения",
    "Риск кроется в том, как вы реагируете на стресс. Когда одному нужна поддержка через разговор, другой закрывается.",
    "",
    "3. Потенциал развития",
    "Если вы научитесь не принимать особенности друг друга как личную угрозу, ваш союз может стать очень надежным.",
    "",
    "4. Рекомендация",
    "Снизьте ожидания быстрого изменения партнера. Попробуйте договориться о 'безопасном слове' или правиле для ситуаций, когда напряжение зашкаливает.",
  ].join("\n"));
}

export async function generateCompatibility(input: {
  creatorId: string;
  partnerId: string;
  creatorText: string;
  partnerText: string;
  type: string;
  requestId?: string;
}) {
  const fallback = heuristicCompatibility();

  try {
    const response = await aiComplete({
      feature: "product-compatibility",
      userId: input.creatorId,
      requestId: input.requestId,
      maxTokens: 1500,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: [
            "Write ETerapy's paid Compatibility result in Russian.",
            "Analyze the two provided perspectives on a relationship.",
            "Use sections: Точки пересечения, Зоны напряжения, Потенциал развития, Рекомендация.",
            "Be objective, safe, and non-fatalistic. Do not diagnose.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `Relationship type: ${input.type}`,
            "",
            "Partner A says:",
            input.creatorText.slice(0, 3000),
            "",
            "Partner B says:",
            input.partnerText.slice(0, 3000),
          ].join("\n"),
        },
      ],
    });

    const text = normalize(response.text);
    if (text.length < 300) {
      return { text: fallback, metadata: { source: "heuristic", fallbackReason: "short_ai_response" } };
    }
    return {
      text,
      metadata: {
        source: "ai",
        provider: response.provider,
        model: response.model,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        latencyMs: response.latencyMs,
      },
    };
  } catch (error) {
    log.warn("compatibility-fallback", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    return { text: fallback, metadata: { source: "heuristic", fallbackReason: "ai_error" } };
  }
}
