import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import { buildSynastryWheel } from "@/lib/esoteric-chart";
import { log, serializeError } from "@/lib/logger";

function normalize(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 7000);
}

function compactBirthData(text: string) {
  return normalize(text).replace(/\s+/g, " ").slice(0, 240);
}

function fallbackSynastryResult(input: {
  userBirthData: string;
  partnerBirthData: string;
  question?: string | null;
}) {
  const question = normalize(input.question ?? "");
  return [
    "Совместимость по звёздам",
    "",
    "Этот разбор стоит читать как язык тем между двумя людьми, а не как verdict о совместимости. Карта не решает за пару — она подсвечивает, где разговору нужна форма.",
    "",
    "Один общий ресурс: в ваших данных уже видно напряжение между близостью и автономией. Это может давать много живости, если заранее договариваться о темпе.",
    "Одна зона различия: один человек быстрее ищет контакт, другой может сначала уходить в тишину и сбор мыслей.",
    question ? `Связь с вопросом: ${question.slice(0, 420)}` : "Связь с вопросом: полезно смотреть не «подходим ли мы», а «как нам говорить, когда мы разные».",
    "",
    "Практический шаг: договоритесь о короткой фразе для паузы. Например: «я рядом, мне нужно 20 минут, потом вернусь к разговору».",
  ].join("\n");
}

export function buildSynastryTeaser(input: {
  userBirthData: string;
  partnerBirthData: string;
  generatedText: string;
}) {
  const lines = input.generatedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLine = lines.find((line) => !/^совместимость по звёздам$/i.test(line))
    ?? "В вашей паре уже виден один ритм: близость легче выдерживается, когда у каждого есть право на темп.";

  return [
    "Один акцент совместимости по звёздам",
    firstLine,
    "",
    `Данные: ${compactBirthData(input.userBirthData)} + ${compactBirthData(input.partnerBirthData)}.`,
    "Полная совместимость по звёздам откроет общие ресурсы, зоны различий и безопасный разговорный шаг.",
  ].join("\n");
}

export async function generateSynastryResult(input: {
  userBirthData: string;
  partnerBirthData: string;
  question?: string | null;
  userId: string;
  requestId?: string;
}): Promise<{ text: string; metadata: Prisma.InputJsonObject }> {
  const fallback = fallbackSynastryResult(input);
  // B388: структурное колесо совместимости в metadata (визуал = «расклад»).
  const wheel = buildSynastryWheel(input.userBirthData, input.partnerBirthData);
  const wheelMeta: Prisma.InputJsonObject = { wheel: wheel as unknown as Prisma.InputJsonValue };

  try {
    const response = await aiComplete({
      feature: "product-synastry",
      userId: input.userId,
      requestId: input.requestId,
      // B388: ограничиваем объём до ≤2 страниц A4 (человеческий текст, не простыня).
      maxTokens: 1300,
      temperature: 0.45,
      messages: [
        {
          role: "system",
          content: [
            "Write an ETerapy synastry result in Russian.",
            "Treat astrology as symbolic language, not fate, diagnosis, or proof.",
            "Do not say whether people must stay together or separate.",
            "Use sections: shared resource, different rhythms, tension pattern, question connection, conversation prompts, safe next step.",
          ].join(" "),
        },
        {
          role: "user",
          content: [
            `User birth data: ${normalize(input.userBirthData)}`,
            `Partner birth data: ${normalize(input.partnerBirthData)}`,
            `Question: ${normalize(input.question ?? "") || "Пользователь хочет понять динамику пары бережно и без фатальности."}`,
          ].join("\n"),
        },
      ],
    });

    const text = normalize(response.text);
    if (text.length < 240) {
      return { text: fallback, metadata: { source: "heuristic", fallbackReason: "short_ai_response", ...wheelMeta } };
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
        ...wheelMeta,
      },
    };
  } catch (error) {
    log.warn("synastry-product-fallback", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    return { text: fallback, metadata: { source: "heuristic", fallbackReason: "ai_error", ...wheelMeta } };
  }
}
