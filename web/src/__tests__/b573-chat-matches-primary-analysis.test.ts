import { readFileSync } from "node:fs";
import { join } from "node:path";

// B573 (owner 2026-07-22): «"Решить вопрос в чате" должен быть 1-в-1 как
// "Первичный разбор": иконка платформы другая, иконка пользователя другая и не
// с той стороны, форма ввода не прилипает к экрану и выглядит иначе, кнопка
// действия другая».
//
// Причина у всех четырёх claims одна: чат-контракт мини-аппа описан в CSS под
// `.dialogue-surface`, а экран чата собирался product-фреймом услуги и под эту
// оболочку не попадал вовсе. Тест держит обе стороны: экран собран той же парой
// (`MiniAppChrome` + `DialogueShell`), а панель рендерит те же компоненты
// реплик и ту же строку композера, что и разбор.

const root = join(__dirname, "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8");

const chatScreen = source("src/components/miniapp/chat-screen.tsx");
const checkinScreen = source("src/components/miniapp/checkin-screen.tsx");
const panel = source("src/components/companion/companion-chat-panel.tsx");
const checkin = source("src/components/dialogue/checkin-experience.tsx");
const miniappCss = source("src/app/miniapp/miniapp-v21.module.css");
const baseCss = source("src/app/v4-soft.css");

describe("B573 — чат и первичный разбор собраны из одних деталей", () => {
  it("экран чата стоит на той же оболочке, что и разбор", () => {
    for (const marker of ["MiniAppChrome", "DialogueShell", 'surface="miniapp"', 'styles["dialogue-surface"]']) {
      expect(chatScreen).toContain(marker);
      expect(checkinScreen + checkin).toContain(marker);
    }
  });

  it("страница чата больше не собирается product-фреймом услуги", () => {
    // Именно он не давал чату попасть под `.dialogue-surface`.
    const page = source("src/app/miniapp/products/chat/page.tsx");
    expect(page).not.toContain("MiniAppProductFrame");
    expect(page).toContain("MiniAppChatScreen");
  });

  it("реплика платформы — компонент со знаком, а не пустой кружок", () => {
    expect(panel).toContain("AssistantMsgAvatar");
    expect(checkin).toContain("AssistantMsgAvatar");
    // Пустой `soft-msg-avatar` без модификатора — ровно то, что видел владелец.
    expect(panel).not.toContain('<div className="soft-msg-avatar" aria-hidden="true" />');
  });

  it("аватар клиента получает имя, как в разборе", () => {
    expect(panel).toContain("<UserMsgAvatar fallbackName={userName} />");
    expect(checkin).toContain("<UserMsgAvatar fallbackName={userName} />");
    expect(chatScreen).toContain("userName={viewerName}");
    expect(checkinScreen).toContain("userName={viewerName}");
  });

  it("композер — строка «поле + круглая кнопка», как в разборе", () => {
    for (const marker of ["soft-dialogue-composer-row", "soft-dialogue-send", "soft-dialogue-counter"]) {
      expect(panel).toContain(marker);
      expect(checkin).toContain(marker);
    }
    // Широкая текстовая кнопка в подвале карточки — прежний вид чата.
    expect(panel).not.toContain('className="soft-button soft-button-primary" data-testid="companion-send"');
  });

  it("классы композера описаны в базовом слое, а не только в мини-аппе", () => {
    // Разметку с этими классами рендерит общий /checkin — на вебе они тоже
    // должны иметь правила, иначе кнопка отправки едет без стилей.
    for (const marker of [".soft-dialogue-composer-row", ".soft-dialogue-send", ".soft-dialogue-counter"]) {
      expect(baseCss).toContain(marker);
      expect(miniappCss).toContain(marker);
    }
  });

  it("вьюпорт прижимается только у живой сессии, а не у завершённой", () => {
    // Урок B561: контракт живого чата нельзя вешать на все фазы — под
    // завершённой сессией лежат рекомендации, и страница обязана скроллиться.
    expect(miniappCss).toContain('.dialogue-surface[data-phase="chat"] :global(.soft-chat-screen[data-state="active"])');
    expect(panel).toContain('data-state={locked ? "completed" : "active"}');
  });
});
