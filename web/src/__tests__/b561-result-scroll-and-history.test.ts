import fs from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const CHECKIN_EXPERIENCE = "src/components/dialogue/checkin-experience.tsx";
const DIALOGUE_SHELL = "src/components/dialogue/dialogue-shell.tsx";
const DIALOGUE_THREAD = "src/components/dialogue/dialogue-thread.tsx";
const MINIAPP_CSS = "src/app/miniapp/miniapp-v21.module.css";
const SOFT_CSS = "src/app/v4-soft.css";

describe("B561 — страница результата скроллится, история не слипается", () => {
  it("оболочка разбора выносит фазу в DOM", () => {
    const shell = source(DIALOGUE_SHELL);
    const experience = source(CHECKIN_EXPERIENCE);

    expect(shell).toContain("data-phase={phase}");
    expect(experience).toContain("phase={phase}");
  });

  it("вьюпортный контракт мини-аппа висит только на живом диалоге", () => {
    const css = source(MINIAPP_CSS);

    // Контракт «тред во весь остаток + композер внизу» принадлежит фазе
    // clarifying. Раньше он ловил `.dialogue-surface` целиком — вместе с
    // результатом, который из-за этого не прокручивался.
    expect(css).toContain('.screen-scroll:has(.dialogue-surface[data-phase="clarifying"])');
    expect(css).not.toMatch(/\.screen-scroll:has\(\.dialogue-surface\)\s*\{/);
  });

  it("клавиатурные правила тоже ограничены фазами с полем ввода", () => {
    const css = source(MINIAPP_CSS);

    expect(css).toContain(
      ':global(html[data-miniapp-keyboard-open="true"]) .dialogue-surface:where([data-phase="question"], [data-phase="clarifying"])',
    );
  });

  it("свёрнутая история получает тот же контракт, что живая сессия", () => {
    const thread = source(DIALOGUE_THREAD);
    const css = source(SOFT_CSS);

    expect(thread).toContain('className="soft-dialogue-history-thread"');
    // Класс был, а правил под ним не было вовсе — реплики шли без отступов.
    expect(css).toMatch(/\.soft-dialogue-history-thread\s*\{[^}]*gap:\s*0\.85rem/);
    expect(css).toMatch(/\.soft-dialogue-history-thread\s*\{[^}]*flex-direction:\s*column/);
  });

  it("чат в мини-аппе не считает высоту веб-константой", () => {
    const css = source(MINIAPP_CSS);

    expect(css).toMatch(/\.product-action-boundary :global\(\.soft-chat-screen\)\s*\{[^}]*height:\s*auto/);
    expect(css).toMatch(
      /\.product-action-boundary :global\(\.soft-chat-thread\)\s*\{[^}]*var\(--miniapp-viewport-height/,
    );
  });

  it("история переписки в чате использует ту же разметку, что живой тред", () => {
    const panel = source("src/components/companion/companion-chat-panel.tsx");

    // messageThread() отдаёт одну и ту же разметку и для живого треда, и для
    // свёрнутой истории — расхождению взяться неоткуда.
    expect(panel).toContain('className="soft-dialogue-chat soft-chat-thread"');
    expect(panel).toContain("{locked ? (");
    expect(panel).toContain("messageThread(false)");
  });
});
