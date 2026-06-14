import fs from "node:fs";
import path from "node:path";
import { buildChatAnalysisTeaser } from "@/lib/chat-analysis";
import { buildDeepReportTeaser } from "@/lib/deep-report";
import { buildPerspectivesTeaser } from "@/lib/perspectives";
import { buildCircleTeaser, buildPairTeaser } from "@/lib/social-clarity";
import { buildSymbolicProductTeaser } from "@/lib/symbolic-products";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const dialogue = {
  id: "dlg-z6",
  title: "Стоит ли менять работу",
  topic: "career",
  difficulty: "medium",
  safetyLevel: "normal",
  messages: [
    { role: "USER", content: "Стоит ли менять работу сейчас?" },
    { role: "ASSISTANT", content: "Что в текущей работе сильнее всего истощает?" },
    { role: "USER", content: "Нет ощущения роста, но страшно потерять стабильность." },
  ],
};

describe("M24 Z6 real truncated product teasers", () => {
  it("turns a full perspectives result into 1 opened angle plus 3 locked angle titles", () => {
    const fullResult = JSON.stringify({
      angles: [
        {
          id: "mind",
          title: "Разум",
          subtitle: "факты и неизвестное",
          facts: ["Вы хотите роста, но стабильность остаётся важной опорой."],
          unknowns: ["Какой риск действительно непереносим?"],
          options: ["Собрать факты по рынку до увольнения."],
          ask: "Что вы уже знаете наверняка?",
          step: "Сравните текущую работу и две вакансии по трём фактам.",
        },
        { id: "feeling", title: "Чувства", subtitle: "", facts: [], unknowns: [], options: [], ask: "", step: "" },
        { id: "symbol", title: "Символ", subtitle: "", facts: [], unknowns: [], options: [], ask: "", step: "" },
        { id: "action", title: "Действие", subtitle: "", facts: [], unknowns: [], options: [], ask: "", step: "" },
      ],
    });

    const teaser = buildPerspectivesTeaser(dialogue, fullResult);

    expect(teaser).toContain("Бесплатная часть");
    expect(teaser).toContain("Вы хотите роста");
    expect(teaser).toContain("Что вы уже знаете наверняка?");
    expect(teaser).toContain("Еще внутри полного результата");
    expect(teaser).toContain("Чувства");
    expect(teaser).toContain("Символ");
    expect(teaser).toContain("Действие");
    expect(teaser).not.toContain("Полный результат раскроет");
  });

  it("builds a deep-report teaser with personalized TOC and the first two report blocks", () => {
    const fullReport = [
      "Подробный разбор",
      "",
      "1. Что я слышу",
      "Вы хотите не просто сменить работу, а вернуть ощущение роста без резкого обрыва стабильности.",
      "",
      "2. Главная развилка",
      "Развилка между терпеть знакомое и проверить новый маршрут маленьким шагом.",
      "",
      "3. Сценарии",
      "Этот раздел должен остаться за стеной.",
    ].join("\n");

    const teaser = buildDeepReportTeaser(dialogue, fullReport);

    expect(teaser).toContain("Персональное оглавление");
    expect(teaser).toContain("Что я слышу");
    expect(teaser).toContain("Главная развилка");
    expect(teaser).toContain("вернуть ощущение роста");
    expect(teaser).toContain("маленьким шагом");
    expect(teaser).not.toContain("Этот раздел должен остаться за стеной");
  });

  it("builds a chat-analysis teaser with recognized text, one insight, and the other person's tone", () => {
    const fullAnalysis = JSON.stringify({
      insight: "В переписке заметна попытка договориться, которая быстро уходит в защиту.",
      tonesThem: [{ label: "защитный", pct: 72 }],
      tonesMe: [{ label: "ищущий", pct: 65 }],
      replies: [{ style: "мягкий", text: "full paid reply" }],
      safetyNote: "full paid safety note",
    });

    const teaser = buildChatAnalysisTeaser("Анна: ты опять пропал\nЯ: мне важно понять, что происходит", fullAnalysis);

    // B395/M26: «фрагмент» banned in client UI → teaser header is «Что удалось прочитать».
    expect(teaser).toContain("Что удалось прочитать");
    expect(teaser).toContain("Собеседник: ты опять пропал");
    expect(teaser).toContain("один инсайт");
    expect(teaser).toContain("быстро уходит в защиту");
    expect(teaser).toContain("тон собеседника: защитный");
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
