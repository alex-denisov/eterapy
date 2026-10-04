/**
 * B750 — БРИФ СПРОСА: автор видит живые данные, а не только число частоты.
 */
import {
  buildDemandBrief,
  formatDemandBrief,
  freshPostsFor,
  relatedPhrasesFrom,
  serpAnglesFrom,
} from "@/lib/seo/demand-brief";

describe("relatedPhrasesFrom", () => {
  it("убирает сам запрос, мусор ниже порога и дубли, сортирует по частоте", () => {
    const rows = [
      { phrase: "к чему снится бывший муж", count: 19_488 },
      { phrase: "К чему снится бывший муж", count: 19_488 },
      { phrase: "снится бывший муж каждую ночь", count: 410 },
      { phrase: "снится бывший муж", count: 50 },
      { phrase: "к чему снится бывший муж во сне", count: 2_740 },
    ];
    const related = relatedPhrasesFrom(rows, "к чему снится бывший муж");
    expect(related.map((r) => r.phrase)).toEqual([
      "к чему снится бывший муж во сне",
      "снится бывший муж каждую ночь",
    ]);
  });
});

describe("serpAnglesFrom", () => {
  it("берёт короткие различные тексты выдачи, без повторов и пустоты", () => {
    const texts = ["Почему снится бывший муж: 7 причин", "почему снится бывший муж: 7 причин", "", "x".repeat(400), "Что делать, если снится бывший"];
    expect(serpAnglesFrom(texts)).toEqual(["Почему снится бывший муж: 7 причин", "Что делать, если снится бывший"]);
  });
});

describe("freshPostsFor", () => {
  const posts = [
    { platform: "threads", excerpt: "Опять приснился бывший муж, проснулась в слезах", targetUrl: "https://t/1" },
    { platform: "vk", excerpt: "Рецепт борща", targetUrl: "https://v/2" },
  ];
  it("оставляет только посты, пересекающиеся с запросом по основам слов", () => {
    const fresh = freshPostsFor(posts as never, "к чему снится бывший муж");
    expect(fresh).toHaveLength(1);
    expect(fresh[0].excerpt).toContain("бывший муж");
  });
});

describe("buildDemandBrief", () => {
  it("не бросает при отказе источников и сообщает, что данных нет", async () => {
    const brief = await buildDemandBrief("к чему снится бывший муж", {
      related: async () => { throw new Error("429"); },
      serp: async () => { throw new Error("timeout"); },
      posts: async () => { throw new Error("down"); },
    });
    expect(brief.related).toEqual([]);
    expect(brief.grounded).toBe(false);
    expect(formatDemandBrief(brief)).toBe("");
  });

  it("собирает и форматирует живые данные", async () => {
    const brief = await buildDemandBrief("к чему снится бывший муж", {
      related: async () => [{ phrase: "к чему снится бывший муж во сне", count: 2_740 }],
      serp: async () => ["Почему снится бывший муж: 7 причин"],
      posts: async () => [{ platform: "threads", excerpt: "Опять приснился бывший муж", targetUrl: "u" } as never],
    });
    expect(brief.grounded).toBe(true);
    const text = formatDemandBrief(brief);
    expect(text).toContain("к чему снится бывший муж во сне (2740");
    expect(text).toContain("Почему снится бывший муж: 7 причин");
    expect(text).toContain("Опять приснился бывший муж");
  });
});
