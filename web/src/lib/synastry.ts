import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import type { SynastryWheel } from "@/lib/esoteric-chart";
import { buildSynastryEphemerisWheel, textMentionsZodiacSign } from "@/lib/natal-ephemeris";
import { defaultPromptTextForFeature } from "@/lib/ai-gateway/prompts";
import { log, serializeError } from "@/lib/logger";
import { normalizeResultSectionHeadings, splitSections } from "@/lib/report-sections";

const SYNASTRY_HEADINGS = ["Прямой ответ", "Главная ось связи", "Эмоциональная совместимость", "Коммуникация", "Притяжение и близость", "Быт и устойчивость", "Конфликт, власть и границы", "Поддержка и рост", "Противоречия пары", "Сценарий в плюсе", "Сценарий в минусе", "Итог в выбранном слое отношений"];

// B451: факты пары для AI — реальные знаки Солнца обоих + баланс течения/трения,
// чтобы разбор опирался на них и совпадал с колесом совместимости.
function synastryFactsForAI(wheel: SynastryWheel, relationshipLayer: string) {
  const flow = wheel.aspects.filter((a) => a.harmony === "flow").length;
  const tension = wheel.aspects.filter((a) => a.harmony === "tension").length;
  const placementLine = (placements: SynastryWheel["a"]["placements"]) => placements
    .map((placement) => `${placement.label}: ${placement.degreeInSign.toFixed(1)}° ${placement.signName}`)
    .join("; ");
  const placementLabel = (side: "a" | "b", key?: string) => wheel[side].placements.find((placement) => placement.luminary === key)?.label ?? key ?? "планета";
  const aspectLine = wheel.aspects.slice(0, 16).map((aspect) => (
    `${placementLabel("a", aspect.fromLuminary)} — ${placementLabel("b", aspect.toLuminary)}: ${aspect.kind ?? aspect.harmony}, орб ${aspect.orb ?? "—"}°`
  )).join("; ");
  return [
    "ТОЧНО ПОСЧИТАНО ПО ЭФЕМЕРИДАМ (не меняй позиции и аспекты):",
    `Ваше Солнце: ${wheel.a.sunSign.name}. Солнце партнёра: ${wheel.b.sunSign.name}.`,
    `Ваши положения: ${placementLine(wheel.a.placements)}.`,
    `Положения партнёра: ${placementLine(wheel.b.placements)}.`,
    `Главные межкарточные аспекты: ${aspectLine || "точных мажорных аспектов в выбранном орбе нет"}.`,
    `Связей «где течёт»: ${flow}; «где трение»: ${tension}.`,
    `Выбранный слой отношений: ${relationshipLayer}.`,
    relationshipLayer === "personal"
      ? "В результате обращайся к заказчику `вы/ваш`, а второго участника называй `партнёр`."
      : "Это рабочая синастрия. Используй выбранные деловые роли, анализируй решения, коммуникацию, риск, власть и разделение ответственности; не переноси разбор в романтику.",
    "Не используй `первый/второй человек`. Не вставляй общие дисклеймеры.",
  ].join("\n");
}

function normalizeInput(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000);
}

function normalizeResult(text: string) {
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 30_000);
}

function headingKey(value: string) {
  return value.replace(/[–-]/g, "—").replace(/\s+/g, " ").replace(/[.:;]+$/, "").trim().toLocaleLowerCase("ru");
}

function mergeSynastrySections(texts: string[]) {
  const wanted = new Map(SYNASTRY_HEADINGS.map((heading) => [headingKey(heading), heading]));
  const bodies = new Map<string, string>();
  for (const text of texts) {
    for (const section of splitSections(normalizeResultSectionHeadings("compatibility-by-date", normalizeResult(text)))) {
      const canonical = wanted.get(headingKey(section.title));
      if (!canonical || !section.body.trim()) continue;
      const existing = bodies.get(canonical) ?? "";
      if (section.body.trim().length > existing.length) bodies.set(canonical, section.body.trim());
    }
  }
  return SYNASTRY_HEADINGS
    .filter((heading) => bodies.has(heading))
    .map((heading) => `## ${heading}\n\n${bodies.get(heading)}`)
    .join("\n\n");
}

function weakestSynastryHeadings(text: string) {
  const sizes = new Map(splitSections(text).map((section) => [headingKey(section.title), section.body.length]));
  return [...SYNASTRY_HEADINGS]
    .sort((a, b) => (sizes.get(headingKey(a)) ?? -1) - (sizes.get(headingKey(b)) ?? -1))
    .slice(0, 4);
}

function segmentedRequestId(requestId: string | undefined, suffix: string) {
  return requestId ? `${requestId}:${suffix}` : undefined;
}

function compactBirthData(text: string) {
  return normalizeInput(text).replace(/\s+/g, " ").slice(0, 240);
}

function fallbackSynastryResult(input: {
  userBirthData: string;
  partnerBirthData: string;
  focus?: string | null;
  question?: string | null;
  relationshipLayer?: string | null;
}) {
  const focus = normalizeInput(input.focus ?? input.question ?? "");
  return [
    "Совместимость по дате",
    "",
    "Карта пары показывает сочетание двух ритмов: где притяжение складывается естественно и где различия создают напряжение.",
    "",
    "Один общий ресурс: в ваших данных уже видно напряжение между близостью и автономией. Это может давать много живости, если заранее договариваться о темпе.",
    "Одна зона различия: вы можете быстрее искать контакт, а партнёр — сначала уходить в тишину и собирать мысли.",
    focus ? `Фокус чтения: ${focus.slice(0, 180)}.` : "Фокус чтения: общая динамика вашей пары.",
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
  const firstLine = lines.find((line) => !/^совместимость по дате$/i.test(line))
    ?? "В вашей паре уже виден один ритм: близость легче выдерживается, когда у каждого есть право на темп.";

  return [
    "Один акцент совместимости по дате",
    firstLine,
    "",
    `Данные: ${compactBirthData(input.userBirthData)} + ${compactBirthData(input.partnerBirthData)}.`,
    "Полная совместимость по дате откроет общие ресурсы, зоны различий и безопасный разговорный шаг.",
  ].join("\n");
}

export async function generateSynastryResult(input: {
  userBirthData: string;
  partnerBirthData: string;
  focus?: string | null;
  question?: string | null;
  userId: string;
  requestId?: string;
  relationshipLayer?: string | null;
}): Promise<{ text: string; metadata: Prisma.InputJsonObject }> {
  const fallback = fallbackSynastryResult(input);
  // B388: структурное колесо совместимости в metadata (визуал = «расклад»).
  let wheel: SynastryWheel;
  try {
    wheel = buildSynastryEphemerisWheel(input.userBirthData, input.partnerBirthData);
  } catch {
    return { text: fallback, metadata: { source: "heuristic", fallbackReason: "birth_data_not_calculable" } };
  }
  const wheelMeta: Prisma.InputJsonObject = { wheel: wheel as unknown as Prisma.InputJsonValue };

  try {
    // B451: тот же экспертный промпт, что виден/редактируется в /admin/ai
    // (product-compatibility-by-date), + посчитанные факты пары; полный многоглавный разбор.
    const relationshipLayer = normalizeInput(input.relationshipLayer ?? "personal");
    const systemPrompt = `${defaultPromptTextForFeature("product-compatibility-by-date")}\n\n${synastryFactsForAI(wheel, relationshipLayer)}`;
    const context = [
      `Ваши данные рождения: ${normalizeInput(input.userBirthData)}`,
      `Данные рождения партнёра: ${normalizeInput(input.partnerBirthData)}`,
      `Фокус совместимости: ${normalizeInput(input.focus ?? input.question ?? "") || "полная динамика пары"}`,
      `Слой отношений: ${relationshipLayer}.`,
    ].join("\n");
    const groups = Array.from(
      { length: Math.ceil(SYNASTRY_HEADINGS.length / 3) },
      (_, index) => SYNASTRY_HEADINGS.slice(index * 3, (index + 1) * 3),
    );
    const responses = await Promise.all(groups.map((headings, index) => aiComplete({
      feature: "product-compatibility-by-date",
      userId: input.userId,
      requestId: segmentedRequestId(input.requestId, `part-${index + 1}`),
      maxTokens: 6500,
      temperature: 0.42,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            "Собери одну часть большого разбора синастрии. Верни ТОЛЬКО перечисленные разделы и не добавляй остальные.",
            "Каждый заголовок напиши дословно с `##`; внутри дай 3 содержательных абзаца с конкретными положениями и аспектами.",
            headings.includes("Прямой ответ")
              ? "Раздел `## Прямой ответ` должен содержать минимум 500 знаков и прямой вывод по выбранному слою отношений."
              : "",
            ...headings.map((heading) => `## ${heading}`),
            context,
          ].join("\n"),
        },
      ],
    })));

    let text = mergeSynastrySections(responses.map((response) => response.text));
    const qualityIssue = () => {
      if (text.length < 5_000) return "результат слишком короткий";
      if (/(?:первый|второй)\s+человек|\b(?:пользователь|клиент|заявитель)\b/iu.test(text)) return "неверное обращение к заказчику";
      if (!SYNASTRY_HEADINGS.every((heading) => text.includes(`## ${heading}`))) return "нет обязательных разделов";
      const sections = splitSections(text);
      const weakSection = sections.find((section) => (
        SYNASTRY_HEADINGS.some((heading) => headingKey(heading) === headingKey(section.title))
        && section.body.replace(/^#{1,6}\s*$/gmu, "").trim().length < (headingKey(section.title) === headingKey("Прямой ответ") ? 350 : 180)
      ));
      if (weakSection) return `неполный раздел ${weakSection.title}`;
      const signs = [...new Set([...wheel.a.placements, ...wheel.b.placements].map((placement) => placement.signName))];
      if (signs.filter((sign) => textMentionsZodiacSign(text, sign)).length < Math.min(5, signs.length)) return "текст не опирается на рассчитанные положения";
      return null;
    };
    let issue = qualityIssue();
    if (issue) {
      const repairHeadings = weakestSynastryHeadings(text);
      const repair = await aiComplete({
        feature: "product-compatibility-by-date",
        userId: input.userId,
        requestId: segmentedRequestId(input.requestId, "repair"),
        maxTokens: 6500,
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              `Дополни только слабые или отсутствующие разделы. Причина: ${issue}.`,
              "Верни только эти заголовки дословно с `##`; каждый раздел — 3–4 конкретных абзаца. Обращайся «вы», второго участника называй «партнёр».",
              repairHeadings.includes("Прямой ответ")
                ? "Для `## Прямой ответ` дай минимум 500 знаков и недвусмысленный вывод по выбранному слою отношений."
                : "",
              ...repairHeadings.map((heading) => `## ${heading}`),
              context,
            ].join("\n"),
          },
        ],
      });
      responses.push(repair);
      text = mergeSynastrySections(responses.map((response) => response.text));
      issue = qualityIssue();
    }
    if (issue) {
      log.warn("synastry-product-quality-failed", {
        requestId: input.requestId,
        qualityIssue: issue,
        resultLength: text.length,
      });
      return { text: fallback, metadata: { source: "heuristic", fallbackReason: `quality_failed:${issue}`, ...wheelMeta } };
    }

    const primaryResponse = responses[0];

    return {
      text,
      metadata: {
        source: "ai",
        provider: primaryResponse.provider,
        model: primaryResponse.model,
        providers: [...new Set(responses.map((response) => response.provider))],
        models: [...new Set(responses.map((response) => response.model))],
        generationParts: responses.length,
        tokensIn: responses.reduce((sum, response) => sum + response.tokensIn, 0),
        tokensOut: responses.reduce((sum, response) => sum + response.tokensOut, 0),
        latencyMs: responses.reduce((sum, response) => sum + response.latencyMs, 0),
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
