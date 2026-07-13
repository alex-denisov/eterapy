import fs from "node:fs";
import path from "node:path";
import { defaultPromptTextForFeature } from "@/lib/ai-gateway/prompts";
import {
  buildReframePreview,
  heuristicReframe,
  personalizeReframeResult,
  reframeResultForDisplay,
  tryParseReframe,
  REFRAME_SYSTEM_PROMPT,
  type ReframeStructured,
} from "@/lib/reframe";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

// B441 (M28): «Переосмысление» (reframe) — самодостаточная услуга на методе
// когнитивного рефрейминга (CBT). Контекст собирается ВНУТРИ услуги (sourceText),
// без первичного диалога/checkin; результат — 4 линзы; автосейв в Дневник.
describe("B441 reframe product (Переосмысление)", () => {
  const sourceText = "Руководитель раскритиковал мою работу при всех, и я не могу перестать думать, что меня уволят.";

  it("builds a self-contained preview and CBT-grounded fallback from free-text input", () => {
    const preview = buildReframePreview(sourceText);
    const report = heuristicReframe(sourceText);

    expect(preview).toContain("четыре угла");
    expect(preview).toContain("когнитивного рефрейминга");

    const reportJson = JSON.parse(report.text) as { angles: Array<{ id: string; title: string }> };
    expect(reportJson.angles).toHaveLength(4);
    expect(reportJson.angles.map((a) => a.id)).toEqual(["thoughts", "feelings", "reframe", "step"]);
    expect(reportJson.angles[2].title).toBe("Другой взгляд");
    expect(JSON.stringify(reportJson.angles[1])).toContain("Руководитель");
    expect(JSON.stringify(reportJson.angles[2])).toContain("Руководитель");
    expect(JSON.stringify(reportJson.angles[3])).toContain("Руководитель");
  });

  // B446: раньше валидный ответ модели выбрасывался при малейшей обёртке (```fence```
  // или фраза до/после JSON) → срабатывал статический фолбэк, который лишь копировал
  // текст пользователя в «Мысли», а остальные углы были общими. Парсер теперь
  // вынимает JSON-объект из мусора, как chat-analysis.
  const fourAngles = JSON.stringify({
    angles: [
      { id: "thoughts", title: "Мысли", subtitle: "", facts: ["a"], unknowns: [], options: [], ask: "", step: "x" },
      { id: "feelings", title: "Чувства", subtitle: "", facts: ["b"], unknowns: [], options: [], ask: "", step: "y" },
      { id: "reframe", title: "Другой взгляд", subtitle: "", facts: ["c"], unknowns: [], options: [], ask: "", step: "z" },
      { id: "step", title: "Шаг", subtitle: "", facts: ["d"], unknowns: [], options: [], ask: "", step: "w" },
    ],
  });

  it("parses LLM JSON even when wrapped in code fences or surrounded by prose", () => {
    expect(tryParseReframe(fourAngles)?.angles).toHaveLength(4);
    expect(tryParseReframe("```json\n" + fourAngles + "\n```")?.angles).toHaveLength(4);
    expect(tryParseReframe("Конечно, вот разбор:\n" + fourAngles + "\nНадеюсь, помогло.")?.angles).toHaveLength(4);
    // мусор и неполный набор углов всё ещё отвергаются (→ честный фолбэк)
    expect(tryParseReframe("просто текст без json")).toBeNull();
    expect(tryParseReframe('{"angles":[{"id":"thoughts"}]}')).toBeNull();
  });

  it("uses a professional psychotherapist persona and forbids fences/echoing", () => {
    expect(REFRAME_SYSTEM_PROMPT).toContain("психотерапевт");
    expect(REFRAME_SYSTEM_PROMPT).toContain("клиническая психология");
    // запрет на обёртки (источник фолбэка) и на простое копирование запроса
    expect(REFRAME_SYSTEM_PROMPT).toContain("ТОЛЬКО валидный JSON");
    expect(REFRAME_SYSTEM_PROMPT).toMatch(/копировать его текст|пересказывать/);
    expect(REFRAME_SYSTEM_PROMPT).toContain("Если фраза подходит почти любому человеку");
    expect(defaultPromptTextForFeature("product-reframe")).toBe(REFRAME_SYSTEM_PROMPT);
  });

  it("repairs generic or incomplete LLM angles instead of accepting formal JSON", () => {
    const generic: ReframeStructured = {
      angles: [
        {
          id: "thoughts",
          title: "Мысли",
          subtitle: "что я себе говорю — и что из этого факт",
          facts: ["Руководитель раскритиковал работу при всех.", "Мысль про увольнение пока остается гипотезой."],
          unknowns: ["Что именно сказал руководитель?"],
          options: ["Уточнить факт и отделить его от вывода."],
          ask: "Что здесь факт, а что прогноз?",
          step: "Записать одну цитату руководителя и один свой вывод.",
        },
        {
          id: "feelings",
          title: "Чувства",
          subtitle: "",
          facts: ["Сильное чувство здесь — нормальная реакция."],
          unknowns: [],
          options: ["Разрешите себе не решать всё прямо сейчас."],
          ask: "",
          step: "Назовите чувство.",
        },
        {
          id: "reframe",
          title: "Другой взгляд",
          subtitle: "",
          facts: ["У этой ситуации есть как минимум ещё одна правдивая трактовка."],
          unknowns: ["Что бы вы сказали близкому человеку?"],
          options: [],
          ask: "Какая трактовка меньше ранит?",
          step: "",
        },
        {
          id: "step",
          title: "Шаг",
          subtitle: "",
          facts: ["Не нужно решать всё за один день."],
          unknowns: ["Какой минимальный шаг добавит понимания?"],
          options: ["Сделайте паузу."],
          ask: "Какой шаг безопасен?",
          step: "Выберите один пункт.",
        },
      ],
    };

    const repaired = personalizeReframeResult(generic, sourceText);

    expect(repaired.repairedAngleIds).toEqual(["feelings", "reframe", "step"]);
    expect(repaired.structured.angles.map((angle) => angle.id)).toEqual(["thoughts", "feelings", "reframe", "step"]);
    expect(JSON.stringify(repaired.structured.angles[0])).toContain("Руководитель");
    expect(JSON.stringify(repaired.structured.angles[1])).toContain("Руководитель");
    expect(JSON.stringify(repaired.structured.angles[2])).toContain("Руководитель");
    expect(JSON.stringify(repaired.structured.angles[3])).toContain("Руководитель");
    expect(repaired.structured.angles.every((angle) => angle.facts.length >= 2 && angle.options.length >= 1 && angle.ask && angle.step)).toBe(true);
  });

  it("repairs saved reframe JSON at display time when source text is available", () => {
    const saved = JSON.stringify({
      angles: [
        { id: "thoughts", title: "Мысли", subtitle: "", facts: ["Руководитель раскритиковал работу."], unknowns: [], options: [], ask: "", step: "" },
        { id: "feelings", title: "Чувства", subtitle: "", facts: ["Это нормально."], unknowns: [], options: [], ask: "", step: "" },
        { id: "reframe", title: "Другой взгляд", subtitle: "", facts: ["Можно посмотреть иначе."], unknowns: [], options: [], ask: "", step: "" },
        { id: "step", title: "Шаг", subtitle: "", facts: ["Сделайте маленький шаг."], unknowns: [], options: [], ask: "", step: "" },
      ],
    });

    const display = reframeResultForDisplay(saved, sourceText);
    const parsed = JSON.parse(display ?? "") as { angles: Array<{ id: string; facts: string[]; options: string[]; ask: string; step: string }> };

    expect(parsed.angles).toHaveLength(4);
    expect(JSON.stringify(parsed.angles)).toContain("Руководитель");
    expect(parsed.angles.every((angle) => angle.facts.length >= 2 && angle.options.length >= 1 && angle.ask && angle.step)).toBe(true);
  });

  it("keeps a durable ProductResult model for paid outputs", () => {
    const schema = source("prisma/schema.prisma");
    expect(schema).toContain("model ProductResult");
    expect(schema).toContain('@@map("product_results")');
  });

  it("route is self-contained (sourceText, no dialogue) with autosave + per-use consume", () => {
    const route = source("src/app/api/products/reframe/route.ts");
    const itemRoute = source("src/app/api/products/reframe/[id]/route.ts");
    const exportRoute = source("src/app/api/products/reframe/[id]/export/route.ts");

    expect(route).toContain('PRODUCT_KEY = "reframe"');
    // B444: бесплатного предпросмотра больше нет — единственное действие generate.
    expect(route).toContain('z.literal("generate")');
    expect(route).not.toContain('z.literal("preview")');
    expect(route).toContain("sourceText");
    expect(route).not.toContain("dialogueId");
    expect(route).toContain("generateReframe");
    expect(route).toContain("reframeResultForDisplay");
    expect(itemRoute).toContain("reframeResultForDisplay");
    expect(route).toContain("consumeProductEntitlementForUse");
    expect(route).toContain('code: "PAYMENT_REQUIRED"');
    // автосейв в Дневник на генерации
    expect(route).toContain("savedAt: new Date()");
    expect(itemRoute).toContain('action: z.enum(["save"])');
    expect(itemRoute).toContain('productKey: "reframe"');
    expect(exportRoute).toContain("Content-Disposition");
  });

  it("wires a self-contained product surface (no checkin/ProductIntake) into the reframe flow", () => {
    const detailPage = source("src/app/products/[slug]/page.tsx");
    const actions = source("src/components/products/reframe-actions.tsx");

    expect(detailPage).toContain("<ReframeActions");
    expect(detailPage).toContain('product.slug === "reframe"');
    expect(actions).toContain('data-testid="reframe-actions"');
    expect(actions).not.toContain("ProductIntake");
    expect(actions).toContain('productKey="reframe"');
    expect(actions).toContain("/api/products/reframe");
    // B443: воронка унифицирована на общий ServiceTriage (как chat-analysis/tarot)
    expect(actions).toContain("<ServiceTriage");
    expect(actions).toContain("recommendSecondaryProducts");
    expect(actions).not.toContain("getNextStepRecommendation");
    expect(actions).not.toContain("next-step-card");
    expect(actions).toContain("дневник");
  });
});
