import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import { DEEP_REPORT_SECTIONS, DEEP_REPORT_SYSTEM_PROMPT } from "@/lib/deep-report-prompt";
import { log, serializeError } from "@/lib/logger";
import { normalizeResultSectionHeadings, splitSections } from "@/lib/report-sections";

export { DEEP_REPORT_SECTIONS, DEEP_REPORT_SYSTEM_PROMPT };

// B442 (M28): «Подробный разбор» — самодостаточная услуга на методе КЛИНИЧЕСКОЙ
// ФОРМУЛИРОВКИ СЛУЧАЯ (case formulation, «5 P»: Presenting / Predisposing /
// Precipitating / Perpetuating / Protective) + Problem-Solving Therapy для плана.
// Контекст приходит как свободный текст ситуации (+ опц. заметка из чипов), БЕЗ
// первичного диалога/checkin. Результат — детальный документ-разбор.

export type DeepReportInput = {
  sourceText: string;
  contextNote?: string;
  userId: string;
  requestId?: string;
};

function firstLine(sourceText: string): string {
  return sourceText.trim().split(/\n+/)[0]?.trim() || "ваша ситуация";
}

export function buildDeepReportTitle(sourceText: string): string {
  return `Подробный разбор: ${firstLine(sourceText).slice(0, 80)}`;
}

export function buildDeepReportPreview(sourceText: string): string {
  return [
    "Оглавление подробного разбора",
    "",
    `Ситуация: ${firstLine(sourceText).slice(0, 280)}`,
    "",
    ...DEEP_REPORT_SECTIONS.map((title, i) => `${i + 1}. ${title}`),
    "",
    "Полный документ: фактическая картина, гипотезы, развилки решения, риски и план действий. Можно скачать PDF и сохранить в Дневник.",
  ].join("\n");
}

// Тизер до оплаты: оглавление + первый раскрытый блок («Что происходит»).
export function buildDeepReportTeaser(sourceText: string, generatedText: string): string {
  const report = normalizeReport(generatedText || heuristicDeepReport(sourceText));
  // Берём первый раздел (до второго заголовка ## …), чтобы показать живой кусок.
  const sections = report.split(/\n(?=##\s)/);
  const firstSection = sections[0]?.trim() ?? "";
  return [
    "Оглавление подробного разбора",
    ...DEEP_REPORT_SECTIONS.map((title, i) => `${i + 1}. ${title}${i === 0 ? " — открыто ниже" : ""}`),
    "",
    firstSection || buildDeepReportPreview(sourceText),
    "",
    "Остальные разделы откроются после оплаты.",
  ].join("\n");
}

function normalizeReport(text: string): string {
  // A 3000–4500-word Russian report can exceed 32k characters. Preserve the
  // complete validated document instead of silently truncating its final sections.
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 60_000);
}

export function heuristicDeepReport(sourceText: string): string {
  const situation = firstLine(sourceText).slice(0, 200);
  return normalizeReport([
    `## ${DEEP_REPORT_SECTIONS[0]}`,
    `Запрос начинается с формулировки: «${situation}». В подробном разборе важно сначала отделить факты от оценок: кто участвует, что уже произошло, какие слова или действия повторяются, где есть неопределенность и какой выбор стоит перед вами сейчас.`,
    "Даже если материала мало, центральная задача уже видна: не получить успокаивающую фразу, а собрать рабочую карту ситуации. В этой карте факты идут отдельно, интерпретации отдельно, а решения оцениваются по цене, риску и ожидаемому эффекту.",
    "",
    `## ${DEEP_REPORT_SECTIONS[1]}`,
    "Ключевая динамика обычно держится на одном главном механизме: борьбе за контроль, страхе потери, избегании разговора, конфликте ценностей, нарушении границ или зависании в неопределенности. Его стоит назвать прямо, потому что именно он определяет, какие действия помогут, а какие только усилят петлю.",
    "Если смотреть на ситуацию как на систему, важны не только ваши чувства, но и реакция другой стороны, сроки, молчание, обещания, деньги, статус отношений или работы. Именно эти детали показывают, где проблема реальная, а где ее усиливает недостаток информации.",
    "",
    `## ${DEEP_REPORT_SECTIONS[2]}`,
    "Первая гипотеза: ситуация могла сложиться из накопленного напряжения, которое долго не называли напрямую. Тогда текущее событие — не единственная причина, а точка, где накопленное стало невозможно игнорировать.",
    "Вторая гипотеза: часть неопределенности поддерживается отсутствием проверяемых договоренностей. В этом случае полезны не догадки о мотивах другого человека, а конкретные вопросы, сроки и критерии, по которым вы поймете, что происходит.",
    "",
    `## ${DEEP_REPORT_SECTIONS[3]}`,
    "Проблему может поддерживать петля: мысль → напряжение → действие или избегание → временное облегчение → усиление прежней мысли. Например, чем дольше откладывается разговор, тем больше приходится додумывать, а додумывание делает разговор еще труднее.",
    "Отдельно проверьте, что именно вы делаете для защиты себя. Иногда защитное действие действительно помогает, а иногда оставляет человека без данных, без ясного выбора и без возможности проверить реальность.",
    "",
    `## ${DEEP_REPORT_SECTIONS[4]}`,
    "Ресурсом может быть способность замечать детали, формулировать запрос, выдерживать сложный разговор и искать не виноватого, а решение. Ограничением может быть нехватка фактов, эмоциональная усталость, зависимость от реакции другого человека или риск принять решение на пике напряжения.",
    "Риски стоит разделить: риск резкого действия, риск затягивания, риск неверной интерпретации и риск остаться в прежнем сценарии. Такой список помогает не драматизировать, но и не делать вид, что цена выбора отсутствует.",
    "",
    `## ${DEEP_REPORT_SECTIONS[5]}`,
    "Сценарий 1: прояснить ситуацию напрямую. Выгода — появятся данные; цена — придется выдержать возможный дискомфорт; риск — другой человек может уйти от ответа. Подходит, если вопрос уже созрел и неопределенность дороже разговора.",
    "Сценарий 2: взять паузу и собрать факты. Выгода — меньше импульсивности; цена — напряжение может сохраняться; риск — пауза станет избеганием. Подходит, если сейчас слишком много эмоций и мало проверенной информации.",
    "Сценарий 3: выбрать действие без ожидания идеальной определенности. Выгода — возвращается контроль над своей частью; цена — нельзя гарантировать реакцию других; риск — придется принять последствия выбора.",
    "",
    `## ${DEEP_REPORT_SECTIONS[6]}`,
    "- Сформулируйте главный вопрос одним предложением.\n- Выпишите факты отдельно от предположений.\n- Подготовьте одну прямую фразу для разговора или письма.\n- Назначьте срок проверки: когда вы смотрите на реакцию и принимаете следующее решение.\n- Запишите критерии: по каким признакам вы поймете, что ситуация улучшается, стоит на месте или требует смены стратегии.",
    "",
    `## ${DEEP_REPORT_SECTIONS[7]}`,
    "Психолог или коуч нужен, если ситуация повторяется, вы понимаете логику, но не можете изменить действие. Юрист или финансовый консультант нужен, если есть договоры, деньги, обязательства, риск потерь или важные документы. Врач или кризисная помощь нужны, если есть угроза безопасности, сильное истощение, самоповреждение, насилие или медицинские симптомы.",
    "С таким специалистом лучше идти не с общим «мне плохо», а с собранной картой: факты, хронология, что вы уже пробовали, чего боитесь, какие решения рассматриваете. Тогда консультация быстрее даст результат, а не повторит сбор контекста с нуля.",
  ].join("\n"));
}

export async function generateDeepReport(input: DeepReportInput): Promise<{ text: string; metadata: Prisma.InputJsonObject }> {
  const fallback = heuristicDeepReport(input.sourceText);

  try {
    const sectionGroups = DEEP_REPORT_SECTIONS.map((title) => [title] as const);
    const parts = await Promise.all(sectionGroups.map(async (titles, partIndex) => {
      const generatePart = (repairReason?: string) => aiComplete({
        feature: "product-deep-report",
        userId: input.userId,
        requestId: input.requestId ? `${input.requestId}:part-${partIndex + 1}${repairReason ? ":repair" : ""}` : undefined,
        maxTokens: 4200,
        temperature: repairReason ? 0.4 : 0.52,
        messages: [
          { role: "system", content: DEEP_REPORT_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              repairReason === "раздел короче 350 слов"
                ? "Предыдущий текст раздела уже сохранён. Напиши к нему самостоятельное ДОПОЛНЕНИЕ на 220–320 новых слов: добавь новые конкретные наблюдения, примеры и инструкции, не повторяй уже сказанное. Сохрани тот же заголовок."
                : repairReason
                  ? `Предыдущая версия не прошла проверку: ${repairReason}. Перепиши раздел полностью.`
                  : "",
              input.contextNote ? `Контекст:\n${input.contextNote}` : "",
              "Ситуация для подробного разбора:",
              input.sourceText.slice(0, 8000),
              `Сейчас напиши ТОЛЬКО этот раздел: ## ${titles[0]}.`,
              "Раздел должен содержать 400–550 слов, 5–7 содержательных абзацев, конкретные детали исходной ситуации и полностью расписанные практические рекомендации. Не добавляй остальные разделы.",
            ].filter(Boolean).join("\n\n"),
          },
        ],
      });

      let response = await generatePart();
      const responses = [response];
      let extracted = extractDeepReportPart(response.text, titles);
      let issue = deepReportPartIssue(extracted, titles);
      if (issue) {
        const previousIssue = issue;
        response = await generatePart(previousIssue);
        responses.push(response);
        const repaired = extractDeepReportPart(response.text, titles);
        extracted = previousIssue === "раздел короче 350 слов"
          ? mergeDeepReportSection(titles[0], extracted, repaired)
          : repaired;
        issue = deepReportPartIssue(extracted, titles);
      }
      if (issue) throw new Error(`deep-report-part-${partIndex + 1}:${issue}`);
      return { text: extracted, responses };
    }));

    const text = normalizeReport(parts.map((part) => part.text).join("\n\n"));
    if (wordCount(text) < 2_800 || DEEP_REPORT_SECTIONS.some((title) => !text.includes(`## ${title}`))) {
      return { text: fallback, metadata: { source: "heuristic", fallbackReason: "assembled_report_failed_quality" } };
    }

    const responses = parts.flatMap((part) => part.responses);
    return {
      text,
      metadata: {
        source: "ai",
        provider: responses[0].provider,
        model: [...new Set(responses.map((response) => response.model))].join(","),
        tokensIn: responses.reduce((sum, response) => sum + response.tokensIn, 0),
        tokensOut: responses.reduce((sum, response) => sum + response.tokensOut, 0),
        latencyMs: Math.max(...responses.map((response) => response.latencyMs)),
        parts: parts.length,
        generationCalls: responses.length,
      },
    };
  } catch (error) {
    log.warn("deep-report-fallback", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    return { text: fallback, metadata: { source: "heuristic", fallbackReason: "ai_error" } };
  }
}

function wordCount(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

function extractDeepReportPart(text: string, titles: readonly string[]) {
  const normalized = normalizeResultSectionHeadings("deep-report", text);
  const sections = splitSections(normalized);
  return titles.map((title) => {
    const section = sections.find((candidate) => candidate.title.toLowerCase() === title.toLowerCase());
    return section ? `## ${title}\n${section.body}` : "";
  }).filter(Boolean).join("\n\n");
}

function mergeDeepReportSection(title: string, first: string, supplement: string) {
  const bodies = [first, supplement].map((text) => {
    const normalized = normalizeResultSectionHeadings("deep-report", text);
    return splitSections(normalized).find((section) => section.title.toLowerCase() === title.toLowerCase())?.body.trim() ?? "";
  }).filter(Boolean);
  return bodies.length > 0 ? `## ${title}\n${bodies.join("\n\n")}` : "";
}

function deepReportPartIssue(text: string, titles: readonly string[]): string | null {
  if (titles.some((title) => !text.includes(`## ${title}`))) return "нет одного из обязательных заголовков";
  if (/\b(?:клиент|пользователь|заявитель)\b/iu.test(text)) return "автор описывает заказчика в третьем лице";
  if (/\b(?:почитайте|поищите книгу|изучите литературу)\b/iu.test(text)) return "рекомендация отправляет читать вместо полной инструкции";
  if (wordCount(text) < 350) return "раздел короче 350 слов";
  return null;
}
