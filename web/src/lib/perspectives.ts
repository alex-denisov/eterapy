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

export type PerspectiveAngle = {
  id: "mind" | "feeling" | "symbol" | "action";
  title: string;
  subtitle: string;
  facts: string[];
  unknowns: string[];
  options: string[];
  ask: string;
  step: string;
};

export type PerspectivesStructured = {
  angles: PerspectiveAngle[];
};

export function buildPerspectivesTitle(dialogue: Pick<DialogueForPerspectives, "title">) {
  return `Полная картина: ${(dialogue.title || "ваш вопрос").slice(0, 80)}`;
}

export function buildPerspectivesPreview(dialogue: DialogueForPerspectives) {
  const first = dialogue.messages.find((message) => message.role === "USER")?.content ?? dialogue.title;
  return [
    "Предпросмотр полной картины",
    "",
    `Запрос: ${first.slice(0, 260)}`,
    "",
    "Полный результат раскроет вопрос через:",
    "- мысли;",
    "- чувства;",
    "- скрытый смысл без фатальности;",
    "- первый шаг.",
  ].join("\n");
}

export function buildPerspectivesTeaser(dialogue: DialogueForPerspectives, generatedText: string) {
  const parsed = tryParsePerspectives(generatedText) ?? tryParsePerspectives(heuristicPerspectives(dialogue).text);
  const first = parsed?.angles[0];
  if (!first) return buildPerspectivesPreview(dialogue);

  const lockedTitles = parsed.angles.slice(1).map((angle) => `- ${angle.title}: ${angle.subtitle || "часть будет открыта после оплаты"}`);
  return [
    `Бесплатная часть: ${first.title}`,
    first.subtitle ? `Фокус: ${first.subtitle}` : "",
    "",
    "Что уже видно",
    ...(first.facts.length ? first.facts.map((fact) => `- ${fact}`) : ["- Вопрос уже достаточно конкретный, чтобы смотреть на него не только одним способом."]),
    "",
    first.ask ? `Вопрос к себе: ${first.ask}` : "",
    first.step ? `Следующий шаг: ${first.step}` : "",
    "",
    "Еще внутри полного результата",
    ...lockedTitles,
  ].filter(Boolean).join("\n");
}

function compactDialogue(dialogue: DialogueForPerspectives) {
  return dialogue.messages
    .map((message) => `${message.role === "USER" ? "User" : "Assistant"}: ${message.content}`)
    .join("\n\n")
    .slice(0, 9000);
}

export function tryParsePerspectives(text: string): PerspectivesStructured | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as { angles?: unknown };
    if (!Array.isArray(raw.angles) || raw.angles.length < 4) return null;
    return raw as PerspectivesStructured;
  } catch {
    return null;
  }
}

export function heuristicPerspectives(dialogue: DialogueForPerspectives): { text: string; metadata: Prisma.InputJsonObject } {
  void dialogue;
  const structured: PerspectivesStructured = {
    angles: [
      {
        id: "mind",
        title: "Мысли",
        subtitle: "что известно, а что — нет",
        facts: [
          "Вы обратились с конкретным вопросом, который вас беспокоит",
          "Ситуация вызывает достаточно напряжения, чтобы искать ответ",
        ],
        unknowns: [
          "Что именно вы хотите получить в итоге — ответ, действие или принятие",
          "Какие факты ещё не учтены в вашей картине мира",
        ],
        options: [
          "Выписать всё, что точно известно, на бумагу",
          "Сформулировать один главный вопрос без лишних деталей",
          "Дать себе 24 часа, не принимая решений",
        ],
        ask: "Если убрать тревогу и оставить только факты — что вы видите?",
        step: "Запишите одно предложение: «Я точно знаю, что...». Без догадок.",
      },
      {
        id: "feeling",
        title: "Чувства",
        subtitle: "что может стоять за вопросом",
        facts: [
          "За этим вопросом, скорее всего, стоит усталость или тревога — это нормально",
          "Желание разобраться — уже шаг навстречу себе",
        ],
        unknowns: [
          "Какое чувство сейчас самое сильное — и оно точно про эту ситуацию?",
          "Когда вы в последний раз чувствовали себя спокойно в этой теме",
        ],
        options: [
          "Назвать чувство вслух или письменно, не объясняя его",
          "Позволить себе не знать ответа прямо сейчас",
          "Обратиться к кому-то, кому доверяете, просто чтобы поделиться",
        ],
        ask: "Что вы пытаетесь не чувствовать, продолжая искать ответ?",
        step: "Назовите одну потребность, которой сейчас мало. Без объяснений кому она должна быть удовлетворена.",
      },
      {
        id: "symbol",
        title: "Скрытый смысл",
        subtitle: "метафорический взгляд",
        facts: [
          "Образ ситуации — порог: старый способ понимать уже тесен, новый ещё не сложился",
        ],
        unknowns: [
          "Кто или что держит дверь закрытой с вашей стороны",
          "Привыкли ли вы к этой неопределённости",
        ],
        options: [
          "Можно зажечь маленький свет — задать тихий вопрос кому-то близкому",
          "Можно выйти из комнаты — взять паузу и сменить обстановку",
          "Можно позвать кого-то, кто поможет сделать следующий шаг вместе",
        ],
        ask: "Если бы эта ситуация была временем суток — что бы это было?",
        step: "Опишите ситуацию одним образом или метафорой. Это часто проясняет больше, чем долгий анализ.",
      },
      {
        id: "action",
        title: "Первый шаг",
        subtitle: "что можно сделать на этой неделе",
        facts: [
          "Вы не обязаны решить всё за один разговор или один день",
          "Маленький шаг лучше большого, но откладываемого",
        ],
        unknowns: [
          "Какой минимальный шаг добавит понимания, не увеличивая давление",
        ],
        options: [
          "Назначить конкретное время для разговора или размышления",
          "Записаться на одну консультацию — для себя, без обязательств",
          "Сделать паузу от темы на 48 часов и наблюдать за собой",
        ],
        ask: "Какой шаг в ближайшие 48 часов не разрушит ничего, но добавит понимания?",
        step: "Выберите один пункт и поставьте конкретную дату, когда вы его сделаете.",
      },
    ],
  };
  return { text: JSON.stringify(structured), metadata: { source: "heuristic" } };
}

export async function generatePerspectives(input: {
  dialogue: DialogueForPerspectives;
  userId: string;
  requestId?: string;
}): Promise<{ text: string; metadata: Prisma.InputJsonObject }> {
  const fallback = heuristicPerspectives(input.dialogue);

  const systemPrompt = [
    "You are ETerapy. Write a 4-angles reflection for the user's dialogue in Russian.",
    "Return ONLY valid JSON — no markdown, no code fences, no explanation — with this exact structure:",
    '{"angles":[',
    '{"id":"mind","title":"Разум","subtitle":"что известно, а что — нет","facts":["...","..."],"unknowns":["...","..."],"options":["...","..."],"ask":"...","step":"..."},',
    '{"id":"feeling","title":"Чувства","subtitle":"что может стоять за вопросом","facts":["..."],"unknowns":["..."],"options":["..."],"ask":"...","step":"..."},',
    '{"id":"symbol","title":"Символ","subtitle":"метафорический взгляд","facts":["..."],"unknowns":["..."],"options":["..."],"ask":"...","step":"..."},',
    '{"id":"action","title":"Действие","subtitle":"что можно сделать на этой неделе","facts":["..."],"unknowns":["..."],"options":["..."],"ask":"...","step":"..."}',
    "]}",
    "Rules: each facts/unknowns/options: 2-4 items, plain Russian strings. Be concrete, warm, non-diagnostic, non-fatalistic. No markdown inside strings.",
  ].join(" ");

  try {
    const response = await aiComplete({
      feature: "product-perspectives",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 1800,
      temperature: 0.5,
      messages: [
        { role: "system", content: systemPrompt },
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

    const parsed = tryParsePerspectives(response.text.trim());
    if (!parsed) {
      return { ...fallback, metadata: { ...fallback.metadata, fallbackReason: "json_parse_failed" } };
    }
    return {
      text: JSON.stringify(parsed),
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
    return fallback;
  }
}
