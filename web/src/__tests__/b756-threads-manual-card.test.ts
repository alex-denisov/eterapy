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
