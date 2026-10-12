/** B772 — собственные посты Threads из API: разбор, кэш, слияние с памятью хуков, доля темы. */

jest.mock("@/lib/marketing/platform-settings", () => ({
  requiredMarketingPlatformValue: jest.fn(async () => "tok-secret"),
}));

import {
  fetchOwnThreadsPosts,
  mergeOwnPosts,
  ownPostsNicheShare,
  resetOwnPostsCache,
} from "@/lib/marketing/threads-own-posts";

const NOW = new Date("2026-10-13T10:00:00Z");
const payload = {
  data: [
    { id: "1", text: "Раки, ало. Таро показало вашего бывшего", permalink: "https://www.threads.com/@a/post/1", timestamp: "2026-10-12T09:00:00+0000", media_type: "TEXT_POST" },
    { id: "2", permalink: "https://www.threads.com/@a/post/2", timestamp: "2026-10-12T10:00:00+0000", media_type: "IMAGE" },
    { id: "3", text: "Просто день без темы", timestamp: "2026-10-11T10:00:00+0000" },
  ],
};
const okFetch = () => jest.fn(async () => ({ ok: true, json: async () => payload })) as unknown as typeof fetch;

beforeEach(() => resetOwnPostsCache());

describe("fetchOwnThreadsPosts", () => {
  it("возвращает посты с текстом и ходит на /me/threads с лимитом", async () => {
    const call = okFetch();
    const posts = await fetchOwnThreadsPosts({ fetchImpl: call, limit: 25, now: NOW });
    expect(posts.map((post) => post.id)).toEqual(["1", "3"]);
    const url = String((call as unknown as jest.Mock).mock.calls[0][0]);
    expect(url).toContain("/v1.0/me/threads?fields=id,text,permalink,timestamp,media_type&limit=25");
  });

  it("кэш 30 минут: второй вызов без сети, через 31 минуту — снова сеть", async () => {
    const call = okFetch();
    await fetchOwnThreadsPosts({ fetchImpl: call, now: NOW });
    await fetchOwnThreadsPosts({ fetchImpl: call, now: new Date(NOW.getTime() + 29 * 60_000) });
    expect(call).toHaveBeenCalledTimes(1);
    await fetchOwnThreadsPosts({ fetchImpl: call, now: new Date(NOW.getTime() + 31 * 60_000) });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("сбой сети, отказ и мусор дают [] и не кэшируются", async () => {
    const boom = jest.fn(async () => { throw new Error("net"); }) as unknown as typeof fetch;
    expect(await fetchOwnThreadsPosts({ fetchImpl: boom, now: NOW })).toEqual([]);
    const denied = jest.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })) as unknown as typeof fetch;
    expect(await fetchOwnThreadsPosts({ fetchImpl: denied, now: NOW })).toEqual([]);
    const junk = jest.fn(async () => ({ ok: true, json: async () => ({ data: "x" }) })) as unknown as typeof fetch;
    expect(await fetchOwnThreadsPosts({ fetchImpl: junk, now: NOW })).toEqual([]);
    const call = okFetch();
    expect((await fetchOwnThreadsPosts({ fetchImpl: call, now: NOW })).length).toBe(2);
  });
});

describe("mergeOwnPosts", () => {
  const own = [
    { id: "1", text: "Раки, ало. Таро показало вашего бывшего", permalink: null, timestamp: "2026-10-12T09:00:00+0000" },
    { id: "3", text: "Ручной пост владельца", permalink: null, timestamp: "2026-10-11T10:00:00+0000" },
    { id: "9", text: "Слишком старый пост", permalink: null, timestamp: "2026-08-01T10:00:00+0000" },
  ];
  it("добавляет только посты, которых нет в базе (по началу текста), и только за окно", () => {
    const db = [{ text: "раки, ало! Таро показало вашего бывшего — и всё остальное", at: new Date("2026-10-12T09:00:00Z") }];
    const merged = mergeOwnPosts(db, own, NOW, 30);
    expect(merged.map((post) => post.text)).toEqual([db[0].text, "Ручной пост владельца"]);
    expect(merged[1].at.toISOString()).toBe("2026-10-11T10:00:00.000Z");
  });
});

describe("ownPostsNicheShare", () => {
  it("доля постов по теме; постов нет — null", () => {
    expect(ownPostsNicheShare([])).toBeNull();
    const share = ownPostsNicheShare([
      { id: "1", text: "Таро показало расклад на бывшего", permalink: null, timestamp: "" },
      { id: "3", text: "Просто день без темы", permalink: null, timestamp: "" },
    ]);
    expect(share).toBe(0.5);
  });
});
