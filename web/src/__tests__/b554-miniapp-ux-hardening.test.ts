import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(pathname: string): string {
  return readFileSync(join(process.cwd(), pathname), "utf8");
}

describe("B554 — Telegram Mini App UX hardening", () => {
  it("starts the home question directly and retires duplicate funnel pages", () => {
    const home = source("src/components/miniapp/screens/home-screen.tsx");
    const experience = source("src/components/dialogue/checkin-experience.tsx");
    const dialogueNew = source("src/app/miniapp/dialogues/new/page.tsx");
    const serviceDetail = source("src/app/miniapp/services/[slug]/page.tsx");

    expect(home).toContain('router.push("/miniapp/checkin?miniappDraft=1")');
    expect(experience).toContain('sessionStorage.getItem("eterapy:miniapp-question")');
    expect(experience).toContain("window.setTimeout(() => setQuestion(draft), 0)");
    expect(dialogueNew).toContain('redirect("/miniapp/checkin")');
    expect(serviceDetail).toContain("redirect(service.href)");
  });

  it("keeps the searchable dialogue history while retaining completed result cards in the Diary", () => {
    const serverData = source("src/lib/miniapp/server-data.ts");
    const dialogues = source("src/components/miniapp/screens/dialogues-screen.tsx");

    expect(serverData).toContain("where: { userId: viewer.id, deletedAt: null }");
    expect(serverData).toContain("dialogueNextCursor");
    expect(dialogues).toContain("Поиск по всей истории вопросов");
    expect(dialogues).toContain("messagesLabel(dialogue.messageCount)");
  });

  it("explains a generation retry without falsely promising that credits were not spent", () => {
    const route = source("src/app/api/products/symbolic/route.ts");
    const service = source("src/components/products/use-symbolic-service.ts");

    expect(route).toContain("Доступ сохранён, повторно платить не нужно");
    expect(service).toContain("Доступ сохранён, повторно платить не нужно");
    expect(route).not.toContain("Баллы не списаны");
    expect(service).not.toContain("Баллы не списаны");
  });

  it("renders a compact Telegram-style composer without a skip action", () => {
    const experience = source("src/components/dialogue/checkin-experience.tsx");
    const avatars = source("src/components/dialogue/user-msg-avatar.tsx");
    const styles = source("src/app/miniapp/miniapp-v21.module.css");

    expect(experience).toContain('placeholder={awaitingAssistant ? "Готовим следующий вопрос…" : "Сообщение"}');
    expect(experience).toContain('aria-label="Отправить"');
    expect(experience).not.toContain("dialogue-skip-clarification");
    expect(avatars).toContain("AssistantMsgAvatar");
    expect(styles).toContain(':global(html[data-miniapp-keyboard-open="true"]) .bottom-nav');
    expect(styles).toContain(".soft-dialogue-composer-row");
  });

  it("keeps nested pages compact and makes the library searchable and finite", () => {
    const shell = source("src/components/miniapp/miniapp-shell.tsx");
    const journeys = source("src/components/miniapp/journey-screens.tsx");

    expect(shell).toContain("topLevel ? <TopBar");
    expect(journeys).toContain('placeholder="Поиск по ситуации"');
    expect(journeys).toContain("setLimit((current) => current + 8)");
    expect(journeys).toContain('href="/miniapp/checkin"');
  });

  it("uses client-facing account copy and exposes notification event controls", () => {
    const profile = source("src/components/miniapp/profile-settings-screens.tsx");
    const profileHome = source("src/components/miniapp/screens/profile-screen.tsx");
    const preferences = source("src/app/api/notifications/preferences/route.ts");

    expect(profile).toContain("В Telegram вы входите автоматически");
    expect(profile).toContain("Какие события присылать");
    expect(profile).not.toMatch(/бережн/iu);
    expect(profileHome).toContain("СОХРАНЯЙТЕ РЕЗУЛЬТАТЫ");
    expect(preferences).toContain("getEventsForRole");
    expect(preferences).toContain("label,");
    expect(preferences).toContain("description,");
  });

  it("brands the Telegram bot as a product while retaining notification commands", () => {
    const telegram = source("src/lib/telegram.ts");
    const webhook = source("src/app/api/telegram/webhook/route.ts");
    const setup = source("src/app/api/telegram/setup-webhook/route.ts");

    expect(telegram).toContain('"setMyName"');
    expect(telegram).toContain('"setMyDescription"');
    expect(telegram).toContain('"setChatMenuButton"');
    expect(telegram).toContain('{ command: "status"');
    expect(telegram).toContain('{ command: "stop"');
    expect(webhook).toContain("OPEN_APP_KEYBOARD");
    expect(webhook).toContain("Что сейчас не даёт вам покоя?");
    expect(setup).toContain("configureTelegramBot");
  });

  // Owner 2026-07-21: «клиент явно не понимает что его ждет. CTA должен быть
  // прямее и понятнее, без бережливой бережливости».
  it("names the deliverable instead of the platform's intention", () => {
    const telegram = source("src/lib/telegram.ts");
    const webhook = source("src/app/api/telegram/webhook/route.ts");

    // Абстрактная формулировка цели платформы больше не используется как оффер.
    expect(telegram).not.toContain("помогает прояснить личный вопрос");
    expect(webhook).not.toContain("когда нужно прояснить вопрос");

    // Приветствие называет результат, его цену и время.
    expect(webhook).toContain("факты, главную развилку и один следующий шаг");
    // B672 сняла слово «Первичный» из приветствия — «бесплатно» встало в начало
    // предложения, поэтому проверка регистронезависимая, а не по подстроке.
    expect(webhook).toMatch(/бесплатно/i);
    expect(webhook).toContain("около трёх минут");

    // CTA — действие, а не «открыть приложение». Формулировку заменил B533
    // (владелец утвердил «Разобрать вопрос» 2026-07-22): требование прежнее,
    // слова новые — см. b533-miniapp-naming.test.ts.
    expect(webhook).toContain('text: "Понять, что дальше"');
    expect(telegram).toContain('{ command: "start", description: "Понять, что дальше — бесплатно" }');
  });
});
