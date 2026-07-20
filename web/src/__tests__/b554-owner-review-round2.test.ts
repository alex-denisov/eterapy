import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (relative: string) => readFileSync(join(process.cwd(), relative), "utf8");

// Вторая волна owner-ревью (2026-07-21) + находки экспертного прохода.
describe("B554 round 2 — owner review", () => {
  it("keeps every focusable field at 16px so iOS cannot zoom the layout", () => {
    const css = source("src/app/miniapp/miniapp-v21.module.css");
    // Ниже 16px Safari масштабирует страницу при фокусе, и в Telegram-вебвью
    // масштаб не сбрасывается — правый край приложения уезжает за экран.
    expect(css).toContain('.stage input:not([type="checkbox"]):not([type="radio"])');
    expect(css).toContain("font-size: max(16px, 1em) !important");
  });

  it("declares the viewport contract the Telegram WebView needs", () => {
    const layout = source("src/app/miniapp/layout.tsx");
    expect(layout).toContain('viewportFit: "cover"');
    expect(layout).toContain('interactiveWidget: "resizes-content"');
  });

  it("retires the unreadable bottom of the type scale", () => {
    const css = source("src/app/miniapp/miniapp-v21.module.css");
    for (const tiny of ["font-size: 7px", "font-size: 8px", "font-size: 9px", "font-size: 10px"]) {
      expect(css).not.toContain(tiny);
    }
  });

  it("pins the dialogue thread to the newest message when the keyboard opens", () => {
    const checkin = source("src/components/dialogue/checkin-experience.tsx");
    expect(checkin).toContain('thread?.addEventListener("focusin", pinToBottom)');
    expect(checkin).toContain('window.visualViewport?.addEventListener("resize", pinToBottom)');
  });

  it("centres the send icon and keeps the control at a full touch target", () => {
    const css = source("src/app/miniapp/miniapp-v21.module.css");
    const send = css.slice(css.indexOf(".dialogue-surface :global(.soft-dialogue-send)"));
    expect(send).toContain("display: grid !important");
    expect(send).toContain("place-items: center");
    expect(send.slice(0, 400)).toContain("width: 44px");
  });

  it("restores the brand halo for the assistant avatar and contrast for the client one", () => {
    const css = source("src/app/miniapp/miniapp-v21.module.css");
    expect(css).toContain("conic-gradient(from 30deg, #f4c9a8, #e8b8d1, #d9c9e8, #f4c9a8) !important");
    expect(css).toContain(".dialogue-surface :global(.soft-msg-avatar-user)");
    // Плоская коралловая заливка гасила и halo, и букву клиента.
    expect(css).not.toContain("background: var(--coral-soft) !important");
  });

  it("hides clarifying chips on the Mini App and drops the canned greeting", () => {
    const checkin = source("src/components/dialogue/checkin-experience.tsx");
    const css = source("src/app/miniapp/miniapp-v21.module.css");
    expect(checkin).toContain('className="mt-3 hidden flex-wrap gap-2 lg:flex"');
    expect(checkin).not.toContain("Спасибо, что доверились");
    expect(css).toContain('.dialogue-surface :global([data-testid="dialogue-clarifying-chips"])');
  });

  it("shows real calendar dates in the Diary instead of hardcoded numbers", () => {
    const diary = source("src/components/miniapp/screens/diary-screen.tsx");
    expect(diary).toContain("currentWeekDates");
    expect(diary).toContain("{item.dayLabel}");
    expect(diary).not.toContain("index + 14");
    expect(diary).not.toContain("{14 + index}");
  });

  it("greets by the actual time of day", () => {
    const home = source("src/components/miniapp/screens/home-screen.tsx");
    expect(home).toContain("function greeting()");
    expect(home).not.toContain("Добрый вечер, {viewerName}");
  });

  it("never leaves a settings mutation without a recovery path", () => {
    const settings = source("src/components/miniapp/profile-settings-screens.tsx");
    // Каждый await fetch должен быть внутри try — иначе обрыв сети запирает UI.
    const fetches = settings.split("await fetch(").length - 1;
    const guards = settings.split("try {").length - 1;
    expect(fetches).toBeGreaterThan(0);
    expect(guards).toBeGreaterThanOrEqual(fetches);
  });

  it("returns the client into the Mini App after logout", () => {
    const logout = source("src/app/api/auth/logout/route.ts");
    expect(logout).toContain('params.get("callbackUrl")');
    // Только относительный внутренний путь: иначе это open redirect.
    expect(logout).toContain('callbackUrl.startsWith("/")');
    expect(logout).toContain('!callbackUrl.startsWith("//")');
  });

  it("lets the video control bar wrap so the leave button survives 390px", () => {
    const controls = source("src/components/video/video-controls.tsx");
    expect(controls).toContain("flex flex-wrap items-center justify-center");
    expect(controls).toContain("min-h-[44px] shrink-0 items-center gap-2 rounded-full bg-red-500/80");
  });

  it("hides the tab bar during a live session", () => {
    const shell = source("src/components/miniapp/miniapp-shell.tsx");
    expect(shell).toContain('pathname.startsWith("/miniapp/session/")');
    expect(shell).toContain("{inLiveSession ? null : <BottomNav />}");
  });
});
