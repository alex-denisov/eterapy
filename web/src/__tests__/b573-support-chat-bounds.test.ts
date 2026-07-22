import { readFileSync } from "node:fs";
import { join } from "node:path";

// B573 (owner 2026-07-22): «при нажатии "Написать в чат" форма с историей
// диалогов неправильно выполнена (заходит за края экрана)».
//
// Высота треда стояла константами (`min-h-[280px]` / `max-h-[420px]`). Они не
// знают ни про блок базы знаний над чатом, ни про вьюпорт Telegram, ни про
// поднятую клавиатуру: пол в 280px в одиночку уводил композер под сгиб. Тот же
// класс дефекта уже чинили дважды — B554 п.2 и B561, оба раза заменой
// пиксельной константы на долю реального вьюпорта.

const root = join(__dirname, "..", "..");
const source = (path: string) => readFileSync(join(root, path), "utf8");

const chat = source("src/components/support/support-chat.tsx");
const miniappCss = source("src/app/miniapp/miniapp-v21.module.css");

describe("B573 — чат поддержки помещается в экран", () => {
  it("у треда есть класс-хук, которым мини-апп меряет его вьюпортом", () => {
    expect(chat).toContain("support-chat-thread");
    expect(miniappCss).toContain(".product-action-boundary :global(.support-chat-thread)");
  });

  it("в мини-аппе высота треда считается от вьюпорта, а не константой", () => {
    const rule = miniappCss.slice(miniappCss.indexOf(".product-action-boundary :global(.support-chat-thread)"));
    const body = rule.slice(0, rule.indexOf("}"));
    expect(body).toContain("var(--miniapp-viewport-height");
    // Клавиатура сжимает --miniapp-viewport-height (см. telegram/client.ts),
    // значит тред ужимается вместе с ней и поле остаётся на экране.
    expect(body).toMatch(/max-height:\s*calc\(var\(--miniapp-viewport-height/);
  });

  it("пиксельный пол больше не выше половины низкого экрана", () => {
    // 280px при вьюпорте 380px (375×667 с клавиатурой) не оставляли места
    // композеру вовсе.
    const floor = chat.match(/min-h-\[(\d+)px\]/);
    expect(floor).not.toBeNull();
    expect(Number(floor?.[1])).toBeLessThanOrEqual(160);
  });

  it("пузыри переносят длинные слова, а не растягивают строку", () => {
    // Горизонтальная половина той же жалобы: ссылка без пробелов иначе
    // распирает пузырь за край.
    expect(chat).toContain("[overflow-wrap:anywhere]");
    expect(chat).toContain("max-w-[80%]");
  });
});
