import fs from "node:fs";
import path from "node:path";
import { buildChatAnalysisTeaser } from "@/lib/chat-analysis";
import { buildDeepReportTeaser } from "@/lib/deep-report";
import { buildReframeTeaser } from "@/lib/reframe";
import { buildCircleTeaser, buildPairTeaser } from "@/lib/social-clarity";
import { buildSymbolicProductTeaser } from "@/lib/symbolic-products";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("M24 Z6 real truncated product teasers", () => {
  it("turns a full reframe result into 1 opened lens plus 3 locked lens titles", () => {
    const fullResult = JSON.stringify({
      angles: [
        {
          id: "thoughts",
          title: "Мысли",
          subtitle: "факты и оценка",
          facts: ["Вы решили, что вас уволят, хотя это пока вывод, а не факт."],
          unknowns: ["Что руководитель сказал дословно?"],
          options: ["Выписать факты отдельно от выводов."],
          ask: "Что здесь факт, а что догадка?",
          step: "Запишите одно проверяемое «я точно знаю…».",
        },
        { id: "feelings", title: "Чувства", subtitle: "", facts: [], unknowns: [], options: [], ask: "", step: "" },
        { id: "reframe", title: "Другой взгляд", subtitle: "", facts: [], unknowns: [], options: [], ask: "", step: "" },
        { id: "step", title: "Шаг", subtitle: "", facts: [], unknowns: [], options: [], ask: "", step: "" },
      ],
    });

    const teaser = buildReframeTeaser("Меня раскритиковали при всех, боюсь увольнения", fullResult);

    expect(teaser).toContain("Бесплатный разворот");
    expect(teaser).toContain("это пока вывод");
    expect(teaser).toContain("Что здесь факт, а что догадка?");
    expect(teaser).toContain("Ещё внутри полного переосмысления");
    expect(teaser).toContain("Другой взгляд");
    expect(teaser).toContain("Шаг");
  });

  it("builds a deep-report teaser with the case-formulation TOC and the first opened block", () => {
    const fullReport = [
      "## Что происходит",
      "Вы хотите не просто сменить работу, а вернуть ощущение роста без резкого обрыва стабильности.",
      "",
      "## Как это могло сложиться",
      "Этот раздел должен остаться за стеной.",
    ].join("\n");

    const teaser = buildDeepReportTeaser("Стоит ли менять работу", fullReport);

    expect(teaser).toContain("Оглавление подробного разбора");
    expect(teaser).toContain("Что происходит");
    expect(teaser).toContain("вернуть ощущение роста");
    expect(teaser).toContain("Остальные разделы откроются после оплаты");
    expect(teaser).not.toContain("Этот раздел должен остаться за стеной");
  });

  it("builds an assessment-only chat-analysis teaser (insight + other person's tone, NO transcript)", () => {
    const fullAnalysis = JSON.stringify({
      insight: "В переписке заметна попытка договориться, которая быстро уходит в защиту.",
      tonesThem: [{ label: "защитный", pct: 72 }],
      tonesMe: [{ label: "ищущий", pct: 65 }],
      replies: [{ style: "мягкий", text: "full paid reply" }],
      safetyNote: "full paid safety note",
    });

    const teaser = buildChatAnalysisTeaser("Анна: ты опять пропал\nЯ: мне важно понять, что происходит", fullAnalysis);

    // INC-023: «первый взгляд» = the insight sentence ONLY — no «Один инсайт:» label,
    // no собеседник tone (tone is reserved for the final разбор).
    expect(teaser).toContain("быстро уходит в защиту");
    expect(teaser).not.toContain("Один инсайт");
    expect(teaser).not.toContain("Тон собеседника");
    expect(teaser).not.toContain("защитный");
    expect(teaser).not.toContain("72");
    // INC-021: it must NOT reprint the conversation transcript.
    expect(teaser).not.toContain("Что удалось прочитать");
    expect(teaser).not.toContain("ты опять пропал");
    expect(teaser).not.toContain("Собеседник:");
    expect(teaser).not.toContain("full paid reply");
  });

  it("builds symbolic teasers from the generated result instead of echoing raw input", () => {
    const tarot = buildSymbolicProductTeaser({
      productKey: "tarot",
      userInput: "Стоит ли мне менять работу?",
      generatedText: [
        "Прошлое — Жрица. Вы уже слышите тихий ответ, но пока сомневаетесь.",
        "Настоящее — Башня. This must stay locked.",
        "Возможное — Звезда. This must stay locked too.",
      ].join("\n"),
    });
    const natal = buildSymbolicProductTeaser({
      productKey: "natal-chart",
      userInput: "12.04.1992, 14:35, Москва",
      generatedText: "Акцент вопроса: вам важно вернуть право на собственный темп.",
    });
    const numerology = buildSymbolicProductTeaser({
      productKey: "numerology",
      userInput: "Анна, 12.04.1992",
      generatedText: "Число года — 7. Сильная сторона: видеть глубину там, где другие спешат.",
    });
    expect(tarot).toContain("Первая карта");
    expect(tarot).toContain("Жрица");
    expect(tarot).not.toContain("Башня");
    expect(natal).toContain("Один акцент");
    expect(natal).toContain("собственный темп");
    expect(numerology).toContain("Число года");
    expect(numerology).toContain("Сильная сторона");
  });

  it("expands social teasers into the free block promised by the matrix", () => {
    const pair = buildPairTeaser({
      creatorText: "Я хочу больше ясности и спокойных разговоров.",
      partnerText: "Я тоже хочу спокойствия, но боюсь постоянных претензий.",
      relationType: "romantic",
    });
    const circle = buildCircleTeaser({
      question: "Как нам спокойнее обсудить переезд?",
      participantCount: 3,
      answers: [
        "Важно больше спокойствия и меньше спешки.",
        "Мне кажется, всем страшно потерять опору.",
        "Нужен один следующий шаг без давления.",
      ],
    });

    expect(pair).toContain("Совпадение");
    expect(pair).toContain("Различие");
    expect(pair).toContain("Теплый вопрос");
    expect(circle).toContain("Слепая зона");
    expect(circle).toContain("Следующий шаг");
  });

  it("removes the old echo preview and makes first teaser generation free before the paywall", () => {
    const symbolicRoute = source("src/app/api/products/symbolic/route.ts");
    const chatAnalysisRoute = source("src/app/api/products/chat-analysis/route.ts");
    const symbolicActions = source("src/components/products/symbolic-product-actions.tsx");
    const compatibilityGenerate = source("src/app/api/products/compatibility/[id]/generate/route.ts");
    const circleGenerate = source("src/app/api/products/circle/[id]/generate/route.ts");

    expect(symbolicRoute).not.toContain("previewText: userInput.slice(0, 600)");
    expect(symbolicRoute).toContain("buildSymbolicProductTeaser");
    expect(symbolicRoute).toContain("checkRequestAuthRateLimit");
    expect(chatAnalysisRoute).toContain("checkRequestAuthRateLimit");
    expect(symbolicActions).toContain("Бесплатный фрагмент");
    expect(compatibilityGenerate).toContain("paywalled: true");
    expect(circleGenerate).toContain("paywalled: true");
  });
});
