import fs from "node:fs";
import path from "node:path";
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
    const helper = source("src/lib/chat-analysis.ts");
    
    // B087
    expect(route).toContain("z.literal(\"upload_preview\")");
    expect(route).toContain("z.literal(\"generate\")");
    expect(route).toContain("sourceText");
    expect(route).toContain("sourceText: maskedSourceText");
    
    // Generates anonymized version
    expect(route).toContain("buildChatAnalysisPreview");
    expect(route).toContain("maskChatAnalysisPii");
    expect(helper).toContain("Do not state the other person's intent as fact");
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

    // Schema carries a separate `hint` (recommendation) alongside the copy-ready `text`.
    expect(helper).toContain("hint?: string");
    // Prompt forces text to be a literal, sendable message — not advice.
    expect(helper).toContain("replies[].text MUST be the literal message");
    expect(helper).toContain("belongs ONLY in hint, never in text");
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
});
