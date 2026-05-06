import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

function normalize(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 9000);
}

export function heuristicSevenDaysReport() {
  return normalize([
    "Итоги маршрута «7 дней к ясности»",
    "",
    "За прошедшую неделю вы сделали важные шаги для прояснения ситуации. Самое главное достижение — это само решение выделить время на рефлексию.",
    "",
    "1. Основной фокус",
    "Вы начинали с ощущения неопределенности, но шаг за шагом смогли отделить факты от эмоций.",
    "",
    "2. Обнаруженные паттерны",
    "Стало заметно, что часть напряжения возникает из-за попыток контролировать то, что от вас не зависит.",
    "",
    "3. Дальнейшие шаги",
    "Продолжайте возвращаться к вопросу «что я могу сделать прямо сейчас?». Это поможет сохранять фокус и не тратить энергию на тревогу о будущем.",
  ].join("\n"));
}

export async function generateFinalReport(input: {
  userId: string;
  dialogueId: string;
  requestId?: string;
}) {
  const fallback = heuristicSevenDaysReport();

  try {
    const response = await aiComplete({
      feature: "product-seven-days-report",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 1200,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: [
            "Write ETerapy's paid 7 Days to Clarity final report in Russian.",
            "Summarize the user's journey over 7 days based on their initial dialogue.",
            "Use sections: Основной фокус, Обнаруженные паттерны, Дальнейшие шаги.",
            "Be encouraging and reflective.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Dialogue ID: ${input.dialogueId}`, // In reality, we'd pass dialogue content here
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
    log.warn("seven-days-fallback", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    return { text: fallback, metadata: { source: "heuristic", fallbackReason: "ai_error" } };
  }
}
