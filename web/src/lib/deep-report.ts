import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

type DialogueForDeepReport = {
  id: string;
  title: string;
  topic: string | null;
  difficulty: string | null;
  safetyLevel: string | null;
  messages: Array<{ role: string; content: string }>;
};

export function buildDeepReportTitle(dialogue: Pick<DialogueForDeepReport, "title" | "topic">) {
  const title = dialogue.title?.trim();
  if (title) return `Подробный разбор: ${title.slice(0, 80)}`;
  return `Подробный разбор${dialogue.topic ? `: ${dialogue.topic}` : ""}`;
}

export function buildDeepReportPreview(dialogue: DialogueForDeepReport) {
  const firstUserMessage = dialogue.messages.find((message) => message.role === "USER")?.content ?? dialogue.title;
  return [
    "Предпросмотр подробного разбора",
    "",
    `Запрос: ${firstUserMessage.slice(0, 280)}`,
    "",
    "В полном отчете будут:",
    "- структура ситуации и главная развилка;",
    "- риски, которые важно не игнорировать;",
    "- возможные сценарии без фатальных обещаний;",
    "- практичный план на ближайшие 24-72 часа;",
    "- бережное резюме, которое можно сохранить или экспортировать.",
  ].join("\n");
}

export function buildDeepReportTeaser(dialogue: DialogueForDeepReport, generatedText: string) {
  const report = normalizeReport(generatedText || heuristicDeepReport(dialogue));
  const visibleBlocks = report
    .split(/\n(?=3[.)]\s|\n3\.\s)/)[0]
    .replace(/^Подробный разбор\s*/i, "")
    .trim();
  const firstUserMessage = dialogue.messages.find((message) => message.role === "USER")?.content ?? dialogue.title;

  return [
    "Персональное оглавление",
    `Запрос: ${firstUserMessage.slice(0, 180)}`,
    "- Что я слышу в вашем вопросе",
    "- Главная развилка",
    "- Сценарии и маршрут — в полном отчете",
    "",
    visibleBlocks || buildDeepReportPreview(dialogue),
  ].join("\n");
}

function compactDialogue(dialogue: DialogueForDeepReport) {
  return dialogue.messages
    .map((message) => `${message.role === "USER" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n")
    .slice(0, 12000);
}

function normalizeReport(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 12000);
}

export function heuristicDeepReport(dialogue: DialogueForDeepReport) {
  const preview = buildDeepReportPreview(dialogue);
  return normalizeReport([
    "Подробный разбор",
    "",
    "1. Обзор ситуации",
    "Сейчас важно не искать один окончательный ответ, а отделить факты, чувства и ожидания. Вопрос уже содержит напряжение между желанием ясности и страхом поспешить.",
    "",
    "2. Главная развилка",
    "Похоже, ключевой выбор не только в том, что сделать дальше, а в том, какую цену вы готовы платить за неопределенность и за действие.",
    "",
    "3. Риски",
    "- принять решение из тревоги;",
    "- перепутать надежду с реальными признаками движения;",
    "- игнорировать телесную усталость и границы;",
    "- искать подтверждение только одного желаемого сценария.",
    "",
    "4. Возможности",
    "У ситуации есть пространство для мягкой проверки: маленький шаг, честный вопрос, короткая пауза или разговор без требования немедленного ответа.",
    "",
    "5. План на 24-72 часа",
    "- Запишите три факта без интерпретаций.",
    "- Отдельно выпишите три страха и три желания.",
    "- Выберите одно действие, которое не закрывает все двери.",
    "- Вернитесь к вопросу через сутки и отметьте, стало ли спокойнее.",
    "",
    "6. Бережное резюме",
    "Вы не обязаны решать все сразу. Достаточно сделать следующий шаг так, чтобы он увеличивал ясность, а не давление.",
    "",
    preview,
  ].join("\n"));
}

export async function generateDeepReport(input: {
  dialogue: DialogueForDeepReport;
  userId: string;
  requestId?: string;
}): Promise<{
  text: string;
  metadata: Prisma.InputJsonObject;
}> {
  const fallback = heuristicDeepReport(input.dialogue);

  try {
    const response = await aiComplete({
      feature: "product-deep-report",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 1800,
      temperature: 0.45,
      messages: [
        {
          role: "system",
          content: [
            "Write an ETerapy paid Deep Report in Russian.",
            "Use sections: Обзор ситуации, Главная развилка, Риски, Возможности, План на 24-72 часа, Бережное резюме.",
            "Be specific to the dialogue, warm, non-fatalistic, and safe.",
            "Do not diagnose, manipulate, promise outcomes, or replace medical/legal/financial help.",
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

    const text = normalizeReport(response.text);
    if (text.length < 400) {
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
    log.warn("deep-report-fallback", {
      requestId: input.requestId,
      dialogueId: input.dialogue.id,
      error: serializeError(error),
    });
    return { text: fallback, metadata: { source: "heuristic", fallbackReason: "ai_error" } };
  }
}
