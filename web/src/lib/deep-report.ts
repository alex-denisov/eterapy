import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";

// B442 (M28): «Подробный разбор» — самодостаточная услуга на методе КЛИНИЧЕСКОЙ
// ФОРМУЛИРОВКИ СЛУЧАЯ (case formulation, «5 P»: Presenting / Predisposing /
// Precipitating / Perpetuating / Protective) + Problem-Solving Therapy для плана.
// Контекст приходит как свободный текст ситуации (+ опц. заметка из чипов), БЕЗ
// первичного диалога/checkin. Результат — документ-разбор 6–10 страниц.

export type DeepReportInput = {
  sourceText: string;
  contextNote?: string;
  userId: string;
  requestId?: string;
};

// 7 секций документа (порядок = оглавление в UI). Держим в одном месте, чтобы
// промпт, фолбэк и TOC-сайдбар не разъезжались.
export const DEEP_REPORT_SECTIONS = [
  "Что происходит",
  "Как это могло сложиться",
  "Что удерживает",
  "На что можно опереться",
  "Развилки и сценарии",
  "Маршрут небольших шагов",
  "Бережное резюме и с кем продолжить",
] as const;

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
    "Полный документ — 6–10 страниц: с выводами, сценариями (без предсказаний), маршрутом небольших шагов и бережным резюме. Можно скачать PDF и сохранить в Дневник.",
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
  // 6–10 страниц ≈ 3000–4000 слов ≈ ~28k символов; даём запас до 32k.
  return text.replace(/\n{3,}/g, "\n\n").trim().slice(0, 32000);
}

export function heuristicDeepReport(sourceText: string): string {
  const situation = firstLine(sourceText).slice(0, 200);
  return normalizeReport([
    `## ${DEEP_REPORT_SECTIONS[0]}`,
    `Вы описали это так: «${situation}». Сейчас полезно не искать один окончательный ответ, а отделить факты от оценок и ожиданий — это снижает тревогу и проясняет, в чём на самом деле вопрос.`,
    "",
    `## ${DEEP_REPORT_SECTIONS[1]}`,
    "У каждой такой ситуации есть предыстория (что было «почвой») и более свежий повод, который её обострил. Разделение этих двух слоёв помогает не винить себя за всё сразу.",
    "",
    `## ${DEEP_REPORT_SECTIONS[2]}`,
    "Часто ситуацию удерживает повторяющаяся петля: мысль → чувство → действие (или избегание) → подтверждение мысли. Увидеть эту петлю — половина выхода из неё.",
    "",
    `## ${DEEP_REPORT_SECTIONS[3]}`,
    "У вас уже есть опоры: прежний опыт преодоления, люди рядом, ваши ценности и сильные стороны. Их стоит назвать явно — на них держится любой следующий шаг.",
    "",
    `## ${DEEP_REPORT_SECTIONS[4]}`,
    "Рассмотрим несколько путей и их вероятную цену — без обещаний и предсказаний. Цель не «угадать будущее», а понять, какой выбор вам ближе и почему.",
    "",
    `## ${DEEP_REPORT_SECTIONS[5]}`,
    "- Сформулируйте проблему одним предложением.\n- Выпишите 3–4 варианта без оценки.\n- Выберите один маленький безопасный шаг.\n- Назначьте дату и способ проверить результат.",
    "",
    `## ${DEEP_REPORT_SECTIONS[6]}`,
    "Вы не обязаны решить всё сразу. Если тема тяжёлая или тянется давно — это разумный повод обратиться к специалисту; разбор можно взять с собой как опору для разговора.",
  ].join("\n"));
}

export async function generateDeepReport(input: DeepReportInput): Promise<{ text: string; metadata: Prisma.InputJsonObject }> {
  const fallback = heuristicDeepReport(input.sourceText);

  try {
    const response = await aiComplete({
      feature: "product-deep-report",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 7000,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: [
            "Ты — ETerapy. Напиши ПОЛНЫЙ оплаченный «Подробный разбор» на русском — связный документ-разбор объёмом 6–10 страниц (примерно 3000–4000 слов), а не краткое превью.",
            "Метод — КЛИНИЧЕСКАЯ ФОРМУЛИРОВКА СЛУЧАЯ (case formulation, модель «5 P») + Problem-Solving Therapy для плана. Это структура опытного специалиста, а не гадание.",
            "Разделы строго в этом порядке, каждый — заголовком markdown «## Название»:",
            ...DEEP_REPORT_SECTIONS.map((title, i) => `${i + 1}. ## ${title}`),
            "Содержание разделов:",
            "1. Что происходит — отрази ситуацию словами человека (presenting problem), отдели факты от оценок.",
            "2. Как это могло сложиться — предпосылки (predisposing) и что обострило сейчас (precipitating), бережно и без обвинений.",
            "3. Что удерживает — поддерживающая петля (perpetuating): какие мысли/чувства/действия/избегание держат ситуацию.",
            "4. На что можно опереться — ресурсы и сильные стороны (protective): опыт, люди, ценности, навыки.",
            "5. Развилки и сценарии — 2–3 пути и их вероятная цена, БЕЗ предсказаний и обещаний.",
            "6. Маршрут небольших шагов — план в духе problem-solving: определить проблему → варианты → выбрать → маленький безопасный шаг → как проверить.",
            "7. Бережное резюме и с кем продолжить — поддержка и возврат авторства; когда уместен специалист или формат «Вместе».",
            "Стиль: тёплый, конкретный (опирайся на детали из текста человека), без диагнозов, без фатализма, без обещаний результата. Не заменяй медицинскую/юридическую/финансовую помощь; для острого риска для жизни мягко верни к живой/экстренной помощи. Пиши развёрнуто — это премиальный документ, разделы должны быть содержательными абзацами, а не списком из одной строки.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            input.contextNote ? `Контекст:\n${input.contextNote}` : "",
            "Ситуация для подробного разбора:",
            input.sourceText.slice(0, 8000),
          ].filter(Boolean).join("\n"),
        },
      ],
    });

    const text = normalizeReport(response.text);
    if (text.length < 800) {
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
      error: serializeError(error),
    });
    return { text: fallback, metadata: { source: "heuristic", fallbackReason: "ai_error" } };
  }
}
