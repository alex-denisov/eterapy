import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466 R9 P5 — AI-ассистент сессии (mockups practitioner-session-ai-assistant/
// -notes/-transcript/-client-message). Мобильный pcab-native шелл (карточка
// сессии + 4-сегментный переключатель) + контент по РЕАЛЬНЫМ плоским данным
// (summary/notes/transcript markdown + B478 MessageSegment variant=pcab).
// Структурированные секции макетов (темы/эмоц-фон/риск, SOAP, диаризация) —
// бэклог (нет структурированного AI-выхода).

const PRAC = "src/app/cabinet/practitioner";

describe("R9 → AI-ассистент сессии — mobile pcab shell", () => {
  const editor = () => source(`${PRAC}/sessions/[id]/session-mobile.tsx`);

  it("renders a pcab shell with the reused 4-tab segmented control", () => {
    const src = editor();
    expect(src).toContain('data-testid="practitioner-session-mobile"');
    expect(src).toContain("data-pcab-top");
    expect(src).toMatch(/pcab-screen[^"]*md:hidden/);
    expect(src).toContain("AI-ассистент сессии");
    expect(src).toContain('className="pcab-seg"'); // реюз существующего segmented
    expect(src).toContain("pcab-seg-item");
    expect(src).toContain('data-testid="session-segments-mobile"');
    // 4 сегмента
    expect(src).toContain('key: "summary"');
    expect(src).toContain('key: "notes"');
    expect(src).toContain('key: "transcript"');
    expect(src).toContain('key: "message"');
  });

  it("renders REAL flat data per segment (markdown summary/notes, transcript text)", () => {
    const src = editor();
    expect(src).toContain("SoftMarkdown");
    expect(src).toContain("summaryText");
    expect(src).toContain("notesText");
    expect(src).toContain("pcab-transcript");
    expect(src).toContain("RegenerateNotesButton");
    // разбор отсутствует → генерация по транскрипту + ссылка на квоту
    expect(src).toContain("/practitioner/ai-usage");
  });

  it("embeds the B478 message segment in its pcab variant", () => {
    const src = editor();
    expect(src).toContain('variant="pcab"');
    expect(src).toContain("MessageSegment");
  });

  it("keeps retention/152-ФЗ transparency (owner v2 #4)", () => {
    const src = editor();
    expect(src).toContain("152-ФЗ");
    expect(src).toContain("retentionDays");
  });
});

describe("R9 → «Сообщение» — MessageSegment pcab variant", () => {
  const seg = () => source(`${PRAC}/sessions/[id]/message-segment.tsx`);

  it("adds a pcab variant reusing the same rewrite/send/attach handlers (B478)", () => {
    const src = seg();
    expect(src).toContain('variant?: "desktop" | "pcab"');
    expect(src).toContain('variant === "pcab"');
    expect(src).toContain('data-testid="session-segment-message-mobile"');
    expect(src).toContain('data-testid="session-message-send-mobile"');
    expect(src).toContain('data-testid="session-message-sent-mobile"');
    expect(src).toContain("pcab-msg-ta");
    // тон-чипы переписывают через реальный AI-эндпоинт
    expect(src).toContain("/api/practitioner/messages/rewrite");
    expect(src).toContain("/api/practitioner/messages");
  });
});

describe("R9 → сессия — page split", () => {
  const page = () => source(`${PRAC}/sessions/[id]/page.tsx`);

  it("renders SessionMobile on mobile and the previous desktop tree hidden below md", () => {
    const src = page();
    expect(src).toContain("SessionMobile");
    expect(src).toMatch(/hidden[^"]*md:block/);
    expect(src).toContain('data-testid="practitioner-session-analysis"'); // прежний десктоп-testid
  });
});
