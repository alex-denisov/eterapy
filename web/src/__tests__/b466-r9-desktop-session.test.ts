import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const PAGE = "src/app/cabinet/practitioner/sessions/[id]/page.tsx";

// B466 R9-5 desktop — AI-ассистент сессии по approved -session-v2:
// герой (аватар · N-я встреча · формат · чипы) + 2-колоночная раскладка
// (контент слева, боковая панель «Действия» справа) + 152-ФЗ. Мобильный
// SessionMobile и функциональные сегменты сохранены.

describe("R9-5 desktop session — richer head with avatar/ordinal/format", () => {
  const page = () => source(PAGE);

  it("keeps the mobile tree and hidden desktop container testid", () => {
    const src = page();
    expect(src).toContain("SessionMobile");
    expect(src).toMatch(/hidden[^"]*md:block/);
    expect(src).toContain('data-testid="practitioner-session-analysis"');
  });

  it("computes the session ordinal (N-я встреча) from the client's bookings", () => {
    const src = page();
    expect(src).toContain("clientBookings");
    expect(src).toContain("findIndex((b) => b.id === booking.id)");
    expect(src).toContain("-я встреча");
    expect(src).toContain("sessionFormatLabel(booking.format)");
    // аватар с инициалами
    expect(src).toContain("{initials}");
  });

  it("shows the record-processed and 152-ФЗ retention chips in the head", () => {
    const src = page();
    expect(src).toContain("запись обработана");
    expect(src).toContain('data-testid="session-retention-countdown"');
    expect(src).toContain("хранение");
  });
});

describe("R9-5 desktop session — 2-column layout with side action panel", () => {
  const page = () => source(PAGE);

  it("summary + notes use a 2-column grid with the side «Действия» panel", () => {
    const src = page();
    expect(src).toContain("lg:grid-cols-[minmax(0,1fr)_280px]");
    expect(src).toContain('data-testid="session-side-actions"');
    expect(src).toContain("Действия");
    expect(src).toContain("В план сопровождения");
    expect(src).toContain("Написать клиенту");
    // перегенерация переиспользует существующий клиентский компонент
    expect(src).toContain("RegenerateNotesButton");
  });

  it("keeps the AI badge, transcript server-STT label and one-way message segment", () => {
    const src = page();
    expect(src).toContain("AI · готово");
    expect(src).toContain("Транскрипт · server-STT");
    expect(src).toContain("<MessageSegment");
    // 152-ФЗ приватность в боковой панели
    expect(src).toContain("152-ФЗ");
  });

  it("does not fabricate an unbuilt SOAP/DAP format picker on notes", () => {
    // owner honesty: шаблоны заметок per-направление не построены — не рисуем «формат ▾»
    expect(page()).not.toContain("формат ▾");
  });
});
