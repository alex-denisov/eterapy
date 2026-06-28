import fs from "node:fs";
import path from "node:path";
import {
  canReuseStandaloneSessionOnStart,
  type ChatSessionState,
} from "@/lib/chat-session";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

// B453: каждый «новый диалог» в самостоятельном чате — это свежая нить (новая строка),
// а не новое оплаченное окно, наклеенное на старую переписку. Прошлую самостоятельную
// строку переиспользуем на старте ТОЛЬКО если её окно ещё активно (идемпотентный
// повторный старт без двойного списания) ИЛИ это чистая нетронутая «пустая» строка.
describe("B453 standalone chat starts a fresh thread per «новый диалог»", () => {
  function state(over: Partial<ChatSessionState>): ChatSessionState {
    return { freeMessagesUsed: 0, paidStartedAt: null, paidExpiresAt: null, ...over };
  }

  const now = new Date("2026-06-24T12:00:00Z");

  it("reuses a still-active paid window (idempotent re-start, no double charge)", () => {
    const active = state({
      paidStartedAt: new Date("2026-06-24T11:30:00Z"),
      paidExpiresAt: new Date("2026-06-24T12:15:00Z"),
    });
    expect(canReuseStandaloneSessionOnStart(active, true, now)).toBe(true);
  });

  it("reuses a clean unstarted, message-less shell (avoids orphan rows)", () => {
    const shell = state({ paidStartedAt: null, paidExpiresAt: null });
    expect(canReuseStandaloneSessionOnStart(shell, false, now)).toBe(true);
  });

  it("does NOT reuse a finished/lapsed window — that would resurface old messages", () => {
    const lapsed = state({
      paidStartedAt: new Date("2026-06-24T10:00:00Z"),
      paidExpiresAt: new Date("2026-06-24T10:45:00Z"),
    });
    // с сообщениями или без — завершённую сессию не переиспользуем
    expect(canReuseStandaloneSessionOnStart(lapsed, true, now)).toBe(false);
    expect(canReuseStandaloneSessionOnStart(lapsed, false, now)).toBe(false);
  });

  it("does NOT reuse an unstarted row that already has messages", () => {
    const dirtyShell = state({ paidStartedAt: null, paidExpiresAt: null });
    expect(canReuseStandaloneSessionOnStart(dirtyShell, true, now)).toBe(false);
  });
});

describe("B453 server gates standalone reuse through the new helper", () => {
  const server = source("src/lib/companion-chat-server.ts");

  it("getOrCreateSession reuses a standalone row only via canReuseStandaloneSessionOnStart", () => {
    expect(server).toContain("canReuseStandaloneSessionOnStart");
    // решение строится только для самостоятельного чата (оба источника null);
    // разбор (dialogue/analysis) по-прежнему переиспользует одну нить на источник.
    expect(server).toContain("isStandalone");
  });
});
