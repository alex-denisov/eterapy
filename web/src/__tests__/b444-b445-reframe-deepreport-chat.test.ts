import fs from "node:fs";
import path from "node:path";
import { isReframeJson, reframeToMarkdown } from "@/lib/reframe-format";
import { isWithinExtendGrace, CHAT_SESSION_GRACE_MINUTES, type ChatSessionState } from "@/lib/chat-session";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

// B444: reframe/deep-report без бесплатного предпросмотра — сразу полная генерация;
// сессионность; редизайн результата; рекомендации как у Таро; рендер reframe-JSON.
// B445: чат — сессия создаётся только при «Начать диалог»; после 00:00 — 5-минутное
// «окно решения» о продлении, затем блокировка композера.
describe("B444 reframe JSON → markdown rendering", () => {
  const json = JSON.stringify({
    angles: [
      { id: "thoughts", title: "Мысли", subtitle: "что я себе говорю", facts: ["вы боитесь увольнения"], unknowns: ["что здесь факт?"], options: ["разделите факты и выводы"], ask: "что я точно знаю?", step: "выпишите факты" },
      { id: "feelings", title: "Чувства", subtitle: "потребность", facts: ["тревога"], unknowns: [], options: [], ask: "", step: "назовите чувство" },
    ],
  });

  it("detects reframe JSON and converts angles to markdown headings", () => {
    expect(isReframeJson(json)).toBe(true);
    const md = reframeToMarkdown(json);
    expect(md).toContain("## Мысли");
    expect(md).toContain("## Чувства");
    expect(md).toContain("вы боитесь увольнения");
    expect(md).toContain("Следующий шаг");
    expect(md).not.toContain('"angles"');
  });

  it("passes plain markdown/text through unchanged", () => {
    expect(isReframeJson("## Обычный markdown")).toBe(false);
    expect(reframeToMarkdown("## Обычный markdown")).toBe("## Обычный markdown");
    expect(reframeToMarkdown("")).toBe("");
  });

  it("cabinet + print pages render reframe through reframeToMarkdown", () => {
    const cabinet = source("src/app/cabinet/results/[id]/page.tsx");
    const print = source("src/app/products/print/[id]/page.tsx");
    expect(cabinet).toContain("reframeToMarkdown");
    expect(print).toContain("reframeToMarkdown");
    // PDF доступен из кабинета для любого результата
    expect(cabinet).toContain("/products/print/");
  });
});

describe("B444 reframe/deep-report self-contained, tarot-style intake", () => {
  const reframe = source("src/components/products/reframe-actions.tsx");
  const deep = source("src/components/products/deep-report-actions.tsx");

  it("reframe intake adopts the tarot surface and drops the free preview + PDF + badge", () => {
    expect(reframe).toContain("product-order-surface");
    expect(reframe).toContain("OptionScrollStrip");
    expect(reframe).toContain('action: "generate"');
    expect(reframe).not.toContain('action: "preview"');
    expect(reframe).not.toContain("Скачать PDF");
    expect(reframe).not.toContain("soft-badge");
    // B446: интейк выровнен по tarot — описательный абзац и плашка доступа убраны
    expect(reframe).not.toContain("Попробуйте посмотреть на ситуацию иначе");
    expect(reframe).not.toContain("Доступ открыт, можно переосмыслить");
    // CTA переименован по решению владельца
    expect(reframe).toContain("Провести анализ");
    // свёрнутый блок с вопросом/категориями (как у Таро)
    expect(reframe).toContain('data-testid="reframe-recap"');
  });

  it("deep-report intake drops the TOC preview + badge + PDF and uses an accordion result", () => {
    expect(deep).toContain("product-order-surface");
    expect(deep).toContain("OptionScrollStrip");
    expect(deep).not.toContain("оглавление полного разбора");
    expect(deep).not.toContain("Скачать PDF");
    expect(deep).not.toContain("soft-badge");
    expect(deep).toContain('testId="deep-report-accordion"');
    expect(deep).toContain('data-testid="deep-report-recap"');
    // B446: заголовок результата без «клинического» (понятнее клиенту), плашка доступа убрана
    expect(deep).not.toContain("клиническая формулировка случая");
    expect(deep).toContain("структурный разбор ситуации");
    expect(deep).not.toContain("Доступ открыт, можно собрать разбор");
  });
});

describe("B445 chat session — lazy creation + 5-minute decision window", () => {
  function state(over: Partial<ChatSessionState>): ChatSessionState {
    return { freeMessagesUsed: 0, paidStartedAt: null, paidExpiresAt: null, ...over };
  }

  it("can extend while active and within the grace window, but not after", () => {
    const now = new Date("2026-06-23T12:00:00Z");
    const active = state({ paidStartedAt: new Date("2026-06-23T11:30:00Z"), paidExpiresAt: new Date("2026-06-23T12:15:00Z") });
    expect(isWithinExtendGrace(active, now)).toBe(true);

    const justLapsed = state({ paidStartedAt: new Date("2026-06-23T11:00:00Z"), paidExpiresAt: new Date("2026-06-23T11:58:00Z") });
    expect(isWithinExtendGrace(justLapsed, now)).toBe(true); // 2 мин назад < 5

    const longLapsed = state({ paidStartedAt: new Date("2026-06-23T11:00:00Z"), paidExpiresAt: new Date("2026-06-23T11:50:00Z") });
    expect(isWithinExtendGrace(longLapsed, now)).toBe(false); // 10 мин назад > 5

    const neverStarted = state({});
    expect(isWithinExtendGrace(neverStarted, now)).toBe(false);
    expect(CHAT_SESSION_GRACE_MINUTES).toBe(5);
  });

  it("server creates the session only on start and continues the same session after completion", () => {
    const server = source("src/lib/companion-chat-server.ts");
    // getSessionState: standalone заход возвращает виртуальное состояние без create
    expect(server).toContain("virtualSessionState");
    expect(server).toContain("История остаётся в том же");
    expect(server).not.toContain("grace_expired");
    // start умеет создать строку, если sessionId не передан
    expect(server).toContain("await getOrCreateSession({");
    // окончание окна отдаётся клиенту всегда (для расчёта grace)
    expect(server).toContain("windowExpiresAt");
  });

  it("panel shows the inactivity disclaimer + timer and locks the composer", () => {
    const panel = source("src/components/companion/companion-chat-panel.tsx");
    expect(panel).toContain("При бездействии сессия завершится через");
    expect(panel).toContain('data-testid="companion-grace"');
    expect(panel).toContain("data-locked={locked}");
    expect(panel).toContain("GRACE_WINDOW_MS");
  });
});
