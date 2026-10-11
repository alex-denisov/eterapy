/** B756 — ручной контур Threads: ссылка → карточка, публикует человек. */
import { extractThreadsPostUrl, parseCardDraft, parseCardMark } from "@/lib/marketing/threads-manual-card";

describe("Threads manual card", () => {
  it("находит ссылку на пост", () => {
    expect(extractThreadsPostUrl("глянь https://www.threads.net/@ivan.p/post/CxYz-12 тут разговор")).toBe(
      "https://www.threads.net/@ivan.p/post/CxYz-12",
    );
    expect(extractThreadsPostUrl("https://example.com/post/1")).toBeNull();
  });

  it("принимает ровно два ответа ≤280 без ссылок", () => {
    const ok = parseCardDraft('{"hook":"созвучно теме","replies":["первый","второй","третий"]}');
    expect(ok?.replies).toEqual(["первый", "второй"]);
    expect(parseCardDraft('{"hook":"x","replies":["только один"]}')).toBeNull();
    expect(parseCardDraft('{"hook":"x","replies":["см. https://eterapy.com","второй"]}')).toBeNull();
    expect(parseCardDraft(`{"hook":"x","replies":["${"я".repeat(281)}","второй"]}`)).toBeNull();
  });

  it("отметки владельца короткие и однозначные", () => {
    expect(parseCardMark("опубликовал")).toBe("PUBLISHED");
    expect(parseCardMark("Пропустить")).toBe("SKIPPED");
    expect(parseCardMark("опубликовал сегодня утром после обеда и ещё долго объяснял как всё прошло")).toBeNull();
    expect(parseCardMark("обязательно опубликуй")).toBeNull();
  });
});

import { CARD_DAILY_LIMIT, cardsToday, type ThreadsCard } from "@/lib/marketing/threads-manual-card";

describe("лимит карточек", () => {
  const card = (at: string): ThreadsCard => ({ url: "u", at, replies: ["a", "b"], hook: "h", status: "OPEN" });
  it("считает московские сутки: 21:30 UTC уже следующий день", () => {
    const now = new Date("2026-10-11T10:00:00Z");
    const cards = [card("2026-10-10T21:30:00Z"), card("2026-10-11T08:00:00Z"), card("2026-10-10T10:00:00Z")];
    expect(cardsToday(cards, now)).toBe(2);
    expect(CARD_DAILY_LIMIT).toBe(5);
  });
});
