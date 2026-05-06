import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

export function buildChatAnalysisTitle(sourceText: string) {
  return `Разбор переписки: ${sourceText.slice(0, 30).replace(/\n/g, " ")}...`;
}

export function buildChatAnalysisPreview(sourceText: string) {
  const anonymized = sourceText
    .split("\n")
    .slice(0, 5)
    .map(line => {
      // Very basic heuristic for preview only.
      // E.g., replace leading names: "Анна: привет" -> "Собеседник: привет"
      // or "Я: привет" stays "Я: привет".
      const parts = line.split(":");
      if (parts.length > 1 && parts[0].length < 15) {
        if (parts[0].toLowerCase().trim() === "я") return line;
        return `Собеседник: ${parts.slice(1).join(":").trim()}`;
      }
      return line;
    })
    .join("\n");

  return [
    anonymized,
    sourceText.split("\n").length > 5 ? "..." : "",
    "",
    "Полный разбор покажет:",
    "- 1. Обзор ситуации и контекст",
    "- 2. Вероятные сценарии (без фатальности)",
    "- 3. Риски в коммуникации",
    "- 4. Рекомендации по ответам",
    "- 5. План действий",
  ].filter(Boolean).join("\n");
}

function normalize(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 9000);
}

export function heuristicChatAnalysis(sourceText: string) {
  return normalize([
    "Разбор переписки",
    "",
    "1. Обзор ситуации",
    "В представленном фрагменте видна нехватка прозрачности и попытка добиться ясности. Кто-то из собеседников ожидает конкретики, в то время как другой избегает прямого ответа.",
    "",
    "2. Сценарии",
    "Если коммуникация продолжится в том же ключе, напряжение будет расти. Если один из вас возьмет паузу и переведет разговор в формат 'я-сообщений', шансы на конструктив увеличатся.",
    "",
    "3. Риски",
    "Основной риск — скатиться во взаимные обвинения вместо решения реальной проблемы.",
    "",
    "4. Рекомендации",
    "Постарайтесь не додумывать за собеседника. Задайте прямой вопрос о его намерениях без упрека.",
    "",
    "5. План действий",
    "Сделайте паузу. Подумайте, что именно вам сейчас важно получить от этого диалога, и сформулируйте это в одном спокойном сообщении.",
  ].join("\n"));
}

export async function generateChatAnalysis(input: {
  sourceText: string;
  userId: string;
  requestId?: string;
}): Promise<{ text: string; metadata: Prisma.InputJsonObject }> {
  const fallback = heuristicChatAnalysis(input.sourceText);

  try {
    const response = await aiComplete({
      feature: "product-chat-analysis",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 1500,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: [
            "Write ETerapy's paid Chat Analysis result in Russian.",
            "Use exactly these sections: 1. Обзор, 2. Сценарии, 3. Риски, 4. Рекомендации, 5. План действий.",
            "Do not make definitive medical or psychological diagnoses. Do not be fatalistic. Be objective and supportive.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            "Chat log to analyze:",
            input.sourceText.slice(0, 8000),
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
    log.warn("chat-analysis-fallback", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    return { text: fallback, metadata: { source: "heuristic", fallbackReason: "ai_error" } };
  }
}