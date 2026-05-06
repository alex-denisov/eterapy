import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

type DialogueForPerspectives = {
  id: string;
  title: string;
  topic: string | null;
  difficulty: string | null;
  safetyLevel: string | null;
  messages: Array<{ role: string; content: string }>;
};

export function buildPerspectivesTitle(dialogue: Pick<DialogueForPerspectives, "title">) {
  return `4 ракурса: ${(dialogue.title || "ваш вопрос").slice(0, 80)}`;
}

export function buildPerspectivesPreview(dialogue: DialogueForPerspectives) {
  const first = dialogue.messages.find((message) => message.role === "USER")?.content ?? dialogue.title;
  return [
    "Предпросмотр 4 ракурсов",
    "",
    `Запрос: ${first.slice(0, 260)}`,
    "",
    "Полный результат раскроет вопрос через:",
    "- рациональный ракурс;",
    "- эмоциональный ракурс;",
    "- символический ракурс без фатальности;",
    "- практический шаг.",
  ].join("\n");
}

function compactDialogue(dialogue: DialogueForPerspectives) {
  return dialogue.messages
    .map((message) => `${message.role === "USER" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n")
    .slice(0, 9000);
}

function normalize(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 9000);
}

export function heuristicPerspectives(dialogue: DialogueForPerspectives) {
  const first = dialogue.messages.find((message) => message.role === "USER")?.content ?? dialogue.title;
  return normalize([
    "4 ракурса ответа",
    "",
    `Запрос: ${first}`,
    "",
    "1. Рациональный ракурс",
    "Посмотрите на факты: что уже произошло, чего вы точно не знаете, и какое действие можно проверить без больших потерь.",
    "",
    "2. Эмоциональный ракурс",
    "Внутри может быть не только желание ответа, но и усталость от неопределенности. Это важно признать, не превращая чувство в приказ действовать немедленно.",
    "",
    "3. Символический ракурс",
    "Ситуация похожа на порог: прежний способ понимать происходящее уже тесен, а новый еще не оформлен. Это не знак судьбы, а приглашение уточнить свои границы.",
    "",
    "4. Практический ракурс",
    "Выберите один маленький шаг: задать один вопрос, взять паузу, записать критерии решения или попросить больше ясности.",
    "",
    "Итог",
    "Лучший следующий шаг тот, который добавляет ясности и не усиливает давление.",
  ].join("\n"));
}

export async function generatePerspectives(input: {
  dialogue: DialogueForPerspectives;
  userId: string;
  requestId?: string;
}): Promise<{ text: string; metadata: Prisma.InputJsonObject }> {
  const fallback = heuristicPerspectives(input.dialogue);

  try {
    const response = await aiComplete({
      feature: "product-perspectives",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 1200,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: [
            "Write ETerapy's paid 4-perspectives result in Russian.",
            "Use four sections exactly: Рациональный ракурс, Эмоциональный ракурс, Символический ракурс, Практический ракурс, then Итог.",
            "Stay safe, non-fatalistic, concrete, and warm.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `topic=${input.dialogue.topic ?? "unknown"}`,
            `difficulty=${input.dialogue.difficulty ?? "unknown"}`,
            `safety=${input.dialogue.safetyLevel ?? "unknown"}`,
            "dialogue:",
            compactDialogue(input.dialogue),
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
    log.warn("perspectives-fallback", {
      requestId: input.requestId,
      dialogueId: input.dialogue.id,
      error: serializeError(error),
    });
    return { text: fallback, metadata: { source: "heuristic", fallbackReason: "ai_error" } };
  }
}
