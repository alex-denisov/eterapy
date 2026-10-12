/** B756 — ручной контур Threads: ссылка → карточка, публикует человек. */
import { extractThreadsPostUrl, parseCardMark } from "@/lib/marketing/threads-manual-card";

describe("Threads manual card", () => {
  it("находит ссылку на пост", () => {
    expect(extractThreadsPostUrl("глянь https://www.threads.net/@ivan.p/post/CxYz-12 тут разговор")).toBe(
      "https://www.threads.net/@ivan.p/post/CxYz-12",
    );
    expect(extractThreadsPostUrl("https://example.com/post/1")).toBeNull();
  });

  it("отметки владельца короткие и однозначные", () => {
    expect(parseCardMark("опубликовал")).toBe("PUBLISHED");
    expect(parseCardMark("Пропустить")).toBe("SKIPPED");
    expect(parseCardMark("опубликовал сегодня утром после обеда и ещё долго объяснял как всё прошло")).toBeNull();
    expect(parseCardMark("обязательно опубликуй")).toBeNull();
  });
});
