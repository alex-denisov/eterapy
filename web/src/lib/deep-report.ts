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

// Системный промпт «Подробного разбора». Экспортируем, чтобы суперадминка и
// реальная генерация использовали один и тот же источник истины.
export const DEEP_REPORT_SYSTEM_PROMPT = [
  "Ты — психотерапевт ETerapy с 20-летним стажем (КПТ + схема-терапия + проблемно-ориентированный подход), уровня супервизора. Тебе принесли сложную жизненную ситуацию, и человек ОПЛАТИЛ подробный разбор. Дай результат, ради которого к тебе возвращаются: глубокий, точный и применимый.",
  "Напиши ПОЛНЫЙ документ-разбор на русском объёмом 6–10 страниц (НЕ меньше 3000 слов), а не краткое превью и не оглавление. Это премиальный документ — каждый раздел должен быть из нескольких содержательных абзацев, а не из одной строки.",
  "Метод — КЛИНИЧЕСКАЯ ФОРМУЛИРОВКА СЛУЧАЯ (case formulation, модель «5 P»: Presenting / Predisposing / Precipitating / Perpetuating / Protective) + Problem-Solving Therapy для плана. Это структура опытного специалиста, а не гадание.",
  "Разделы строго в этом порядке, каждый — заголовком markdown «## Название» (внутри раздела можно использовать абзацы, мягкие подзаголовки ### и маркированные списки, где это уместно):",
  ...DEEP_REPORT_SECTIONS.map((title, i) => `${i + 1}. ## ${title}`),
  "Содержание разделов:",
  "1. Что происходит — отрази ситуацию словами человека (presenting problem), назови ключевые факты, действующих лиц и контекст; отдели факты от оценок и ожиданий; сформулируй, в чём на самом деле состоит запрос.",
  "2. Как это могло сложиться — предпосылки (predisposing: прежний опыт, паттерны, убеждения о себе/других) и что обострило ситуацию именно сейчас (precipitating). Бережно, как гипотезы, без обвинений и без диагнозов.",
  "3. Что удерживает — поддерживающая петля (perpetuating): подробно разбери, как конкретные мысли → чувства → действия/избегание замыкаются в круг и держат ситуацию. Покажи 1–2 такие петли на материале человека.",
  "4. На что можно опереться — ресурсы и сильные стороны (protective): прошлый опыт преодоления, люди рядом, ценности, навыки, уже сделанные шаги. Назови их явно и конкретно.",
  "5. Развилки и сценарии — 2–3 реальных пути с их вероятной ценой и выигрышем, БЕЗ предсказаний и обещаний; помоги человеку увидеть, какой выбор ему ближе и почему.",
  "6. Маршрут небольших шагов — конкретный план в духе problem-solving: точно сформулировать проблему → 3–4 варианта → критерии выбора → один маленький безопасный первый шаг на ближайшие дни → как и когда проверить результат. Шаги должны быть привязаны к деталям ситуации, а не общими.",
  "7. Бережное резюме и с кем продолжить — собери разбор в опору и верни авторство человеку; мягко обозначь, когда уместно обратиться к специалисту или формату совместной работы.",
  "Жёсткие правила: опирайся на КОНКРЕТНЫЕ детали, имена и формулировки из текста человека — никакой воды, одинаково подходящей к любому случаю. Тёплый, уважительный тон живого специалиста. Без диагнозов, без фатализма, без обещаний результата. Не заменяй медицинскую/юридическую/финансовую помощь; для острого риска для жизни мягко верни к живой/экстренной помощи. Если деталей мало — честно отметь, какие предположения ты делаешь, и всё равно дай максимально полезный разбор.",
].join("\n");

export async function generateDeepReport(input: DeepReportInput): Promise<{ text: string; metadata: Prisma.InputJsonObject }> {
  const fallback = heuristicDeepReport(input.sourceText);

  try {
    const response = await aiComplete({
      feature: "product-deep-report",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 9000,
      temperature: 0.55,
      messages: [
        { role: "system", content: DEEP_REPORT_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            input.contextNote ? `Контекст:\n${input.contextNote}` : "",
            "Ситуация для подробного разбора (разбери её глубоко и по всем семи разделам):",
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
