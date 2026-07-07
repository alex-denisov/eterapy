import fs from "node:fs";
import path from "node:path";
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatAnalysisActions } from "@/components/products/chat-analysis-actions";
import {
  ChatAnalysisInputError,
  buildChatAnalysisTeaser,
  combineRecognizedChatTexts,
  maskChatAnalysisPii,
  tryParseChatAnalysis,
  validateChatScreenshotDataUrl,
} from "@/lib/chat-analysis";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B087/B088 chat analysis product", () => {
  it("wires the ChatAnalysisActions component into the product detail page", () => {
    const page = source("src/app/products/[slug]/page.tsx");
    const actions = source("src/components/products/chat-analysis-actions.tsx");

    expect(page).toContain("<ChatAnalysisActions");
    expect(actions).toContain('data-testid="chat-analysis-actions"');
    expect(actions).toContain("/api/products/chat-analysis");
  });

  it("implements chat source upload, preview, and safe data handling", () => {
    const route = source("src/app/api/products/chat-analysis/route.ts");
    const prompt = source("src/lib/chat-analysis-prompt.ts");
    
    // B087
    expect(route).toContain("z.literal(\"upload_preview\")");
    expect(route).toContain("z.literal(\"generate\")");
    expect(route).toContain("sourceText");
    expect(route).toContain("sourceText: maskedSourceText");
    
    // Generates anonymized version
    expect(route).toContain("buildChatAnalysisPreview");
    expect(route).toContain("maskChatAnalysisPii");
    expect(prompt).toContain("Не утверждай намерения другого человека как факт");
  });

  it("passes the user context note into generation and records it in metadata", () => {
    const route = source("src/app/api/products/chat-analysis/route.ts");
    const helper = source("src/lib/chat-analysis.ts");

    expect(route).toContain("contextNote: z.string()");
    expect(route).toContain("contextNote: input.contextNote");
    expect(route).toContain("analysisContextNote");
    expect(helper).toContain("contextNote?: string");
    // B320: prompt now labels the context as mandatory framing instead of a soft hint.
    expect(helper).toContain("CONTEXT (must shape the entire analysis)");
  });

  it("allows user to delete the raw source while keeping the result (B088)", () => {
    const itemRoute = source("src/app/api/products/chat-analysis/[id]/route.ts");
    
    expect(itemRoute).toContain("action: z.enum([\"save\", \"delete_source\"])");
    expect(itemRoute).toContain("sourceDeletedAt: new Date()");
    expect(itemRoute).toContain("sourceText: null");
    expect(itemRoute).toContain("recognizedText: null");
  });

  it("implements B211 screenshot OCR preview before analysis", () => {
    const route = source("src/app/api/products/chat-analysis/route.ts");
    const actions = source("src/components/products/chat-analysis-actions.tsx");
    const helper = source("src/lib/chat-analysis.ts");
    const taskPolicy = source("src/lib/ai-gateway/task-policy.ts");
    const domain = source("src/lib/ai-gateway/domain.ts");

    expect(route).toContain("z.literal(\"screenshot_preview\")");
    expect(route).toContain("extractChatTextFromScreenshot");
    expect(route).toContain("recognizedText: maskedSourceText");
    expect(route).toContain("imageStored: false");
    expect(actions).toContain("Распознанный текст");
    expect(actions).toContain("accept=\"image/png,image/jpeg,image/webp\"");
    expect(helper).toContain("feature: \"product-chat-analysis-ocr\"");
    expect(helper).toContain("{ type: \"image_url\"");
    expect(taskPolicy).toContain("product-chat-analysis-ocr");
    expect(domain).toContain("AIGatewayContentBlock");
  });

  it("B378 accepts screenshot batches as one ordered OCR preview without storing raw images", () => {
    const route = source("src/app/api/products/chat-analysis/route.ts");
    const actions = source("src/components/products/chat-analysis-actions.tsx");

    expect(route).toContain("z.literal(\"screenshots_preview\")");
    expect(route).toContain("screenshots: z.array");
    expect(route).toContain(".max(10");
    expect(route).toContain("combineRecognizedChatTexts");
    expect(route).toContain("sourceKind: \"screenshots\"");
    expect(route).toContain("screenshotCount");
    expect(route).toContain("imageStored: false");

    // B395/B404: upload affordances are clear labelled buttons, not helper
    // lines or the «5-10 скриншотов» label.
    expect(actions).toContain("Скриншоты переписки");
    expect(actions).toContain("multiple");
    expect(actions).toContain("Загрузить файл (.txt, экспорт из Telegram)");

    expect(combineRecognizedChatTexts(["Анна: привет\n\n", "", " Я: отвечу позже "])).toBe("Анна: привет\n\nЯ: отвечу позже");
  });

  it("B404 defers OCR off the free first screen and recognises screenshots one by one with progress", () => {
    const route = source("src/app/api/products/chat-analysis/route.ts");
    const actions = source("src/components/products/chat-analysis-actions.tsx");

    // Server: a lean single-image OCR action exists (sequential uploads avoid the
    // 10×4 MB oversized-body failure, INC-018) and returns recognised text only.
    expect(route).toContain("z.literal(\"ocr_screenshot\")");
    expect(route).toContain("extractChatTextFromScreenshot");

    // Client: attaching a screenshot must NOT call any OCR/preview endpoint — OCR
    // is deferred to «Начать разбор» (anti-fraud). The attach handler is local.
    expect(actions).toContain("async function attachScreenshots");
    expect(actions).toContain("action: \"ocr_screenshot\"");
    expect(actions).not.toContain("action: \"screenshots_preview\"");

    // Clipboard paste is gone (nobody keeps a chat in the clipboard — it confused
    // the affordance).
    expect(actions).not.toContain("pasteFromClipboard");
    expect(actions).not.toContain("ClipboardPaste");
    expect(actions).not.toContain("chat-analysis-upload-paste");

    // Labelled progress instead of a bare spinner (INC-019).
    expect(actions).toContain("Распознаём скриншот");
    expect(actions).toContain("chat-analysis-progress");
  });

  it("B407/INC-021+INC-023 keeps «первый взгляд» as the insight only — no transcript, no label, no tone", () => {
    const helper = source("src/lib/chat-analysis.ts");
    // INC-021: never reprint the conversation.
    expect(helper).not.toContain("Что удалось прочитать");
    expect(helper).not.toContain("anonymizeChatPreview");

    const teaser = buildChatAnalysisTeaser("Анна: ты пропал\nЯ: важно понять", JSON.stringify({
      insight: "Видна попытка договориться, которая уходит в защиту.",
      tonesThem: [{ label: "защитный", pct: 72 }],
      tonesMe: [{ label: "ищущий", pct: 65 }],
      replies: [{ style: "мягкий", text: "x" }],
      safetyNote: "y",
    }));
    // INC-023: insight sentence only — no «Один инсайт:» label, no собеседник tone.
    expect(teaser).toContain("уходит в защиту");
    expect(teaser).not.toContain("Один инсайт");
    expect(teaser).not.toContain("Тон собеседника");
    expect(teaser).not.toContain("защитный");
  });

  it("B407/INC-024 makes replies ALWAYS LLM: no Gemini thinking truncation + fence-tolerant parse", () => {
    const gemini = source("src/lib/ai-gateway/gemini-adapter.ts");
    // Gemini-2.5* disables thinking so the budget isn't consumed by thinking tokens
    // (which truncated the structured JSON → heuristic fallback).
    expect(gemini).toContain("thinkingConfig: { thinkingBudget: 0 }");
    expect(gemini).toContain('model.startsWith("gemini-2.5")');

    // tryParseChatAnalysis tolerates ```fences``` and surrounding prose so a valid
    // LLM answer is used instead of falling back to the static heuristic.
    const fenced = "```json\n{\"insight\":\"i\",\"tonesThem\":[],\"tonesMe\":[],\"replies\":[{\"style\":\"мягкий\",\"text\":\"привет\"}],\"safetyNote\":\"s\"}\n```";
    const prose = "Вот результат: {\"insight\":\"i\",\"replies\":[{\"style\":\"прямой\",\"text\":\"ок\"}]} — готово.";
    expect(tryParseChatAnalysis(fenced)?.replies[0].text).toBe("привет");
    expect(tryParseChatAnalysis(prose)?.replies[0].text).toBe("ок");
    // Truncated JSON (no closing brace) still safely yields null (→ heuristic last resort).
    expect(tryParseChatAnalysis('{"insight":"i","replies":[{"style":"мягкий","text":"при')).toBeNull();
  });

  it("B406/INC-022 makes reply variants copy-ready and keeps recommendations outside the copyable text", () => {
    const helper = source("src/lib/chat-analysis.ts");
    const actions = source("src/components/products/chat-analysis-actions.tsx");
    const prompt = source("src/lib/chat-analysis-prompt.ts");

    // Schema carries a separate `hint` (recommendation) alongside the copy-ready `text`.
    expect(helper).toContain("hint?: string");
    // Prompt forces text to be a literal, sendable message — not advice.
    expect(prompt).toContain("буквальный текст сообщения");
    expect(prompt).toContain("Не добавляй кавычки, советы, комментарии");
    // UI renders the hint OUTSIDE the copyable text; CopyButton still copies only r.text.
    expect(actions).toContain("{r.hint && (");
    expect(actions).toContain("<CopyButton text={r.text} />");
  });

  it("B409/INC-026 removes the OCR per-user daily token cap and keeps a step-2 manual-text recovery", () => {
    const taskPolicy = source("src/lib/ai-gateway/task-policy.ts");
    const actions = source("src/components/products/chat-analysis-actions.tsx");

    // INC-026: the OCR feature must NOT carry a per-user daily token budget — a paying
    // client runs many разборов/day and the cap was silently misreported as un-recognised
    // screenshots. The resolved-policy value (null) is locked in ai-task-policy.test.ts.
    const ocrBlock = taskPolicy.slice(
      taskPolicy.indexOf('feature: "product-chat-analysis-ocr"'),
      taskPolicy.indexOf('feature: "product-chat-analysis"', taskPolicy.indexOf('feature: "product-chat-analysis-ocr"')),
    );
    expect(ocrBlock).not.toContain("perUserDailyTokenBudget");

    // Step 2 (Контекст) now has a real «добавить текст вручную» recovery that
    // re-runs the preview — so the failed-OCR message is no longer a false promise.
    expect(actions).toContain("async function appendManualText");
    expect(actions).toContain("chat-analysis-context-manual-add");
    expect(actions).toContain("Добавить текст вручную");
  });

  it("INC-013/B415 gates a guest to the full /login page instead of leaking a raw Unauthorized", () => {
    const actions = source("src/components/products/chat-analysis-actions.tsx");

    // «Начать разбор» routes a guest to the full /login page (the login modal was
    // retired in B415), preserving the typed draft + a return path — never a raw
    // «Unauthorized». After login they return via ?next= and resume.
    expect(actions).not.toContain("import { AuthModal }");
    expect(actions).not.toContain("<AuthModal");
    expect(actions).toContain("redirectToLoginWithReturn");
    expect(actions).toContain("loginUrl()");
    expect(actions).toContain("authStatus !== \"authenticated\"");
    // Backstop: a 401 also routes to /login rather than surfacing the raw message.
    expect(actions).toContain("typed.status === 401");
  });

  it("validates screenshot data URLs and masks PII before storage", () => {
    const pngBytes = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      Buffer.alloc(700, 1),
    ]);
    const parsed = validateChatScreenshotDataUrl(`data:image/png;base64,${pngBytes.toString("base64")}`);
    expect(parsed.mimeType).toBe("image/png");
    expect(parsed.byteLength).toBe(pngBytes.length);
    expect(parsed.sha256).toHaveLength(64);

    expect(() => validateChatScreenshotDataUrl("data:text/plain;base64,AAAA")).toThrow(ChatAnalysisInputError);

    const masked = maskChatAnalysisPii("Анна: мой телефон +7 999 123-45-67, email anna@example.com и https://example.com @anna");
    expect(masked).toContain("[телефон скрыт]");
    expect(masked).toContain("[email скрыт]");
    expect(masked).toContain("[ссылка скрыта]");
    expect(masked).toContain("[ник скрыт]");
  });

  it("Z7/B395 keeps no consent checkbox and no false name-masking claim; privacy cue lives in the hero", () => {
    const actions = source("src/components/products/chat-analysis-actions.tsx");
    const shell = source("src/components/products/product-page-shell.tsx");
    const redesign = source("src/lib/product-page-redesign.ts");

    // No legacy consent checkbox.
    expect(actions).not.toContain("checkbox");
    expect(actions).not.toContain("переписка — моя");
    // B395 (owner): the claim that names are auto-replaced with «Я»/«Собеседник»
    // was FALSE and was removed from the tool. It must not reappear.
    expect(actions).not.toContain("Имена заменяются");
    // Privacy is now a quiet muted cue in the product hero, not a loud notice.
    expect(shell).toContain("spec.trustLine");
    expect(redesign).toContain("Приватно — видно только вам");
  });

  it("B485 restores ?analysis= results without blanking on incomplete structured JSON and uses the tarot result shell", async () => {
    const originalFetch = global.fetch;
    window.history.pushState({}, "", "/products/chat-analysis?analysis=analysis-1");
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path === "/api/products/chat-analysis") {
        return new Response(JSON.stringify({ hasEntitlement: false, results: [] }), { status: 200 });
      }
      if (path === "/api/products/chat-analysis/analysis-1") {
        return new Response(JSON.stringify({
          result: {
            id: "analysis-1",
            status: "READY",
            title: "Разбор переписки",
            previewText: null,
            resultText: JSON.stringify({
              insight: "Здесь есть попытка сблизиться без ясной договоренности.",
              replies: [{ style: "мягкий", text: "Давай спокойно уточним, что происходит." }],
              safetyNote: "Если есть угрозы, лучше обратиться за живой помощью.",
            }),
            saved: true,
            metadata: { sourceText: "Я: привет\nОн: потом" },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
    }) as typeof fetch;

    try {
      const { container } = render(React.createElement(ChatAnalysisActions));
      expect(await screen.findByTestId("chat-analysis-result")).toBeInTheDocument();
      expect(screen.getByText("Здесь есть попытка сблизиться без ясной договоренности.")).toBeInTheDocument();
      expect(container.querySelector('[data-testid="chat-analysis-result-shell"]')).toHaveClass("tarot-order-surface");
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/products/chat-analysis/analysis-1", expect.anything()));
    } finally {
      global.fetch = originalFetch;
      window.history.pushState({}, "", "/");
    }
  });

  it("B489 renders legacy string-based tones/replies and the full structured source recap", () => {
    const actions = source("src/components/products/chat-analysis-actions.tsx");

    expect(actions).toContain("normalizeToneEntries");
    expect(actions).toContain("normalizeReplyVariants");
    expect(actions).toContain("formatMessengerTranscript");
    expect(actions).toContain("chat-analysis-source-line");
    expect(actions).toContain("chat-analysis-source-message");
    expect(actions).not.toContain(".slice(0, 220)");
    expect(actions).not.toContain("chat-analysis-start-new");
    expect(actions).not.toContain("chat-analysis-autosaved");

    const legacy = JSON.stringify({
      insight: "В переписке есть напряжение.",
      tonesThem: ["защитный", "отстраненный"],
      tonesMe: ["тревожный", "ищущий"],
      replies: ["Давай спокойно обсудим это завтра.", "Мне важно не спорить, а понять тебя."],
      safetyNote: "Если есть угрозы, обратитесь за живой помощью.",
    });
    const parsed = tryParseChatAnalysis(legacy);
    expect(parsed?.tonesThem).toEqual(["защитный", "отстраненный"]);
    expect(parsed?.replies).toEqual(["Давай спокойно обсудим это завтра.", "Мне важно не спорить, а понять тебя."]);
  });

  it("B489 restores an old generated result with string tones/replies without empty result blocks", async () => {
    const originalFetch = global.fetch;
    window.history.pushState({}, "", "/products/chat-analysis?analysis=legacy-1");
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path === "/api/products/chat-analysis") {
        return new Response(JSON.stringify({ hasEntitlement: false, results: [] }), { status: 200 });
      }
      if (path === "/api/products/chat-analysis/legacy-1") {
        return new Response(JSON.stringify({
          result: {
            id: "legacy-1",
            status: "READY",
            title: "Разбор переписки",
            previewText: null,
            resultText: JSON.stringify({
              insight: "В разговоре много попыток договориться, но мало ясных границ.",
              tonesThem: ["защитный", "отстраненный"],
              tonesMe: ["тревожный", "ищущий"],
              replies: ["Давай спокойно обсудим это завтра.", "Мне важно не спорить, а понять тебя."],
              uncertainZones: ["что именно человек готов обсуждать"],
              conflictPoints: ["разговор быстро уходит в защиту"],
              dontSend: ["не писать длинное объяснение сразу"],
              safetyNote: "Если есть угрозы, лучше обратиться за живой помощью.",
            }),
            saved: true,
            metadata: {
              sourceText: "Я: привет, хочу понять что происходит\nОн: не начинай опять\nЯ: мне важно договориться",
              analysisContextNote: "Кто собеседник: партнёр",
            },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
    }) as typeof fetch;

    try {
      render(React.createElement(ChatAnalysisActions));
      expect(await screen.findByText("защитный")).toBeInTheDocument();
      expect(screen.getByText("Давай спокойно обсудим это завтра.")).toBeInTheDocument();
      fireEvent.click(screen.getByTestId("chat-analysis-recap-toggle"));
      expect(screen.getByTestId("chat-analysis-source-transcript")).toBeInTheDocument();
      expect(screen.getAllByTestId("chat-analysis-source-line")).toHaveLength(3);
      expect(screen.queryByTestId("chat-analysis-start-new")).not.toBeInTheDocument();
      expect(screen.queryByTestId("chat-analysis-autosaved")).not.toBeInTheDocument();
    } finally {
      global.fetch = originalFetch;
      window.history.pushState({}, "", "/");
    }
  });

  it("B490 renders the source as a messenger transcript with toggle label and no shell focus tint", async () => {
    const css = source("src/app/v4-soft.css");
    expect(css).toContain(".chat-analysis-result-shell:focus-within");
    expect(css).toContain("box-shadow: var(--soft-shadow-sm)");

    const originalFetch = global.fetch;
    window.history.pushState({}, "", "/products/chat-analysis?analysis=messenger-1");
    global.fetch = jest.fn(async (url: RequestInfo | URL) => {
      const path = String(url);
      if (path === "/api/products/chat-analysis") {
        return new Response(JSON.stringify({ hasEntitlement: false, results: [] }), { status: 200 });
      }
      if (path === "/api/products/chat-analysis/messenger-1") {
        return new Response(JSON.stringify({
          result: {
            id: "messenger-1",
            status: "READY",
            title: "Разбор переписки",
            previewText: null,
            resultText: JSON.stringify({
              insight: "В разговоре есть напряжение.",
              tonesThem: ["защитный", "отстраненный"],
              tonesMe: ["собранный", "уточняющий"],
              replies: ["Давай спокойно проясним это.", "Мне нужен прямой ответ."],
              uncertainZones: ["почему собеседник отвечает коротко"],
              dontSend: ["не отправлять длинное обвинение"],
              safetyNote: "Если есть угрозы, важнее безопасность.",
            }),
            saved: true,
            metadata: {
              sourceText: "Сегодня\nЯ: Привет, хочу понять что происходит\n12:31 прочитано\nОн: Потом отвечу",
              analysisContextNote: "Кто собеседник: партнёр",
            },
          },
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
    }) as typeof fetch;

    try {
      render(React.createElement(ChatAnalysisActions));
      const toggle = await screen.findByTestId("chat-analysis-recap-toggle");
      expect(toggle).toHaveTextContent("показать");
      fireEvent.click(toggle);
      expect(toggle).toHaveTextContent("скрыть");
      expect(screen.getByTestId("chat-analysis-source-transcript")).toBeInTheDocument();
      expect(screen.getByTestId("chat-analysis-source-date")).toHaveTextContent("Сегодня");
      expect(screen.getAllByTestId("chat-analysis-source-message")).toHaveLength(2);
      expect(screen.getByText("12:31")).toBeInTheDocument();
      expect(screen.getByText("прочитано")).toBeInTheDocument();
      expect(screen.getAllByTestId("chat-analysis-reply")).toHaveLength(3);
      expect(screen.getByText("границы")).toBeInTheDocument();
      expect(screen.getAllByTestId("chat-analysis-signal-card")).toHaveLength(2);
    } finally {
      global.fetch = originalFetch;
      window.history.pushState({}, "", "/");
    }
  });

  it("B490 keeps the chat-analysis prompt decisive, admin-managed, and locked to exactly 3 reply objects", () => {
    const prompt = source("src/lib/chat-analysis-prompt.ts");
    const helper = source("src/lib/chat-analysis.ts");
    const defaults = source("src/lib/ai-gateway/prompts.ts");

    expect(helper).toContain("CHAT_ANALYSIS_SYSTEM_PROMPT");
    expect(defaults).toContain('"product-chat-analysis": CHAT_ANALYSIS_SYSTEM_PROMPT');
    expect(prompt).toContain("ясный, прозрачный и практически полезный результат");
    expect(prompt).toContain("Не уходи в чрезмерную нейтральность");
    expect(prompt).toContain("replies: всегда ровно 3 объекта");
    expect(prompt).toContain("Стратегии строго разные");
    expect(prompt).toContain("как быть дальше и что можно ответить");
    expect(prompt).toContain("Не обещай результата");
  });
});
