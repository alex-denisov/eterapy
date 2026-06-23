import fs from "node:fs";
import path from "node:path";
import { isPaidSessionActive, type ChatSessionState } from "@/lib/chat-session";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

// B449: заход на /products/chat должен звать начать НОВУЮ сессию, а не выбрасывать
// в последнюю (завершённую) сессию. Когда сессия завершена — под композером
// показываем рекомендательный блок услуг (как в Таро), а дубль «Сессия завершена»
// в soft-ask-foot убираем (он уже есть плейсхолдером в composer-input).
describe("B449 standalone chat invites a new session instead of resuming a finished one", () => {
  function state(over: Partial<ChatSessionState>): ChatSessionState {
    return { freeMessagesUsed: 0, paidStartedAt: null, paidExpiresAt: null, ...over };
  }

  it("only an active paid window resumes a standalone chat; a lapsed/locked one invites a new session", () => {
    const now = new Date("2026-06-23T12:00:00Z");
    const active = state({
      paidStartedAt: new Date("2026-06-23T11:30:00Z"),
      paidExpiresAt: new Date("2026-06-23T12:15:00Z"),
    });
    const lapsed = state({
      paidStartedAt: new Date("2026-06-23T10:00:00Z"),
      paidExpiresAt: new Date("2026-06-23T10:45:00Z"),
    });
    // Активное окно → переиспользуем сессию (таймер идёт, не выбрасываем из диалога).
    expect(isPaidSessionActive(active, now)).toBe(true);
    // Истёкшее/завершённое окно → НЕ переиспользуем, зовём начать новую (приглашение).
    expect(isPaidSessionActive(lapsed, now)).toBe(false);
  });

  it("getSessionState reuses the last standalone session only while it is still active", () => {
    const server = source("src/lib/companion-chat-server.ts");
    // standalone-ветка переиспользует прошлую сессию ТОЛЬКО если она ещё активна,
    // иначе отдаёт virtualSessionState (стартовый гейт — приглашение к новой сессии).
    expect(server).toContain("isPaidSessionActive(toState(existing");
    expect(server).toContain("return virtualSessionState();");
  });
});

describe("B449 finished chat shows a tarot-style recommendations block + no duplicate «Сессия завершена»", () => {
  const panel = source("src/components/companion/companion-chat-panel.tsx");

  it("renders the shared ServiceTriage recommendations when the session is finished (locked)", () => {
    expect(panel).toContain("ServiceTriage");
    // ServiceTriage отрисует это как data-testid в DOM (проверяется в браузере)
    expect(panel).toContain('testId="companion-followup-triage"');
    // рекомендации строятся клиентским хелпером (как у chat-analysis/tarot)
    expect(panel).toContain("recommendPrimaryProduct");
    expect(panel).toContain("recommendSecondaryProducts");
    // блок появляется только когда сессия завершена (locked), не во время grace
    expect(panel).toContain("locked && (");
    // первичный CTA — начать новый диалог
    expect(panel).toContain("Начать новый диалог");
  });

  it("does not duplicate «Сессия завершена» — it stays only in the composer-input placeholder", () => {
    // дубль убран из soft-ask-foot: больше нет отрисованного текстом «Сессия завершена»
    expect(panel).not.toContain(">Сессия завершена<");
    // канонический текст — плейсхолдер инпута (companion-input)
    expect(panel).toContain('"Сессия завершена."');
  });
});
