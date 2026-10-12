/** B767 — области жизни, окно повтора 7 суток, квоты недели, Google-источник. */
jest.mock("@/lib/db", () => ({ __esModule: true, default: {} }));

import {
  MIN_AREA_SHARE,
  STARTER_AREAS,
  areaWeights,
  chooseArea,
  decideArea,
  defaultAreas,
  matchApprovedArea,
  parseAreas,
  recordSightings,
} from "@/lib/marketing/threads-life-areas";
import {
  fetchGoogleTrendTexts,
  mergeScenes,
  scenesSimilar,
  scoutPrompt,
  takeScene,
  type ThreadsMaterialPool,
} from "@/lib/marketing/threads-material";

const DAY = 86_400_000;
const NOW = new Date("2026-10-12T10:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

describe("области жизни", () => {
  it("стартовый список — 29 утверждённых областей из тикета, без дублей", () => {
    expect(STARTER_AREAS.length).toBeGreaterThanOrEqual(28);
    expect(new Set(STARTER_AREAS).size).toBe(STARTER_AREAS.length);
    expect(defaultAreas().every((area) => area.status === "approved")).toBe(true);
    expect(parseAreas(null)).toHaveLength(STARTER_AREAS.length);
    expect(parseAreas("мусор")).toHaveLength(STARTER_AREAS.length);
  });

  it("название от модели сопоставляется с утверждённой областью без учёта регистра и знаков", () => {
    const areas = defaultAreas();
    expect(matchApprovedArea(areas, "Начальница!")).toBe("начальница");
    expect(matchApprovedArea(areas, "новая область")).toBeNull();
    expect(matchApprovedArea(areas, undefined)).toBeNull();
  });

  it("новая область предлагается и копит встречи, но сама не утверждается: тему держит владелец", () => {
    let areas = recordSightings(defaultAreas(), ["Коворкинг"], new Date(NOW.getTime() - 4 * DAY));
    expect(areas.find((a) => a.name === "Коворкинг")?.status).toBe("proposed");
    areas = recordSightings(areas, ["коворкинг", "Коворкинг"], new Date(NOW.getTime() - 2 * DAY));
    expect(areas.find((a) => a.name === "Коворкинг")?.sightings).toHaveLength(2);
    areas = recordSightings(areas, ["Коворкинг"], NOW);
    expect(areas.find((a) => a.name === "Коворкинг")?.sightings).toHaveLength(3);
    expect(areas.find((a) => a.name === "Коворкинг")?.status).toBe("proposed");
  });

  it("встречи старше недели не копятся в автоодобрение", () => {
    let areas = recordSightings(defaultAreas(), ["Коворкинг"], new Date(NOW.getTime() - 20 * DAY));
    areas = recordSightings(areas, ["Коворкинг"], new Date(NOW.getTime() - 10 * DAY));
    areas = recordSightings(areas, ["Коворкинг"], NOW);
    expect(areas.find((a) => a.name === "Коворкинг")?.status).toBe("proposed");
  });

  it("решение владельца: одобрить или снять предложенную область", () => {
    const proposed = recordSightings(defaultAreas(), ["Коворкинг"], NOW);
    expect(decideArea(proposed, "коворкинг", true).find((a) => a.name === "Коворкинг")?.status).toBe("approved");
    expect(decideArea(proposed, "коворкинг", false).some((a) => a.name === "Коворкинг")).toBe(false);
    expect(decideArea(proposed, "границы", false).some((a) => a.name === "границы")).toBe(true);
  });
});

describe("квоты недели", () => {
  it("делит по числу уже ушедших сцен и весу владельца", () => {
    expect(chooseArea({ candidates: ["быт", "работа"], usedThisWeek: { быт: 3, работа: 1 } })).toBe("работа");
    expect(chooseArea({ candidates: ["быт", "работа"], usedThisWeek: { быт: 1, работа: 1 }, weights: { быт: 2, работа: 0.5 } })).toBe("быт");
    expect(chooseArea({ candidates: [], usedThisWeek: {} })).toBeNull();
  });

  it("область ниже 5% недели идёт вне очереди — проба до оценки", () => {
    const used = { быт: 30, работа: 29, питомцы: 0 };
    expect(chooseArea({ candidates: ["быт", "работа", "питомцы"], usedThisWeek: used, weights: { питомцы: 0.1 } })).toBe("питомцы");
    expect(MIN_AREA_SHARE).toBe(0.05);
  });

  it("вес по вердиктам: принимаемая область тяжелее отвергаемой, нет данных — нет веса", () => {
    const weights = areaWeights([
      { lifeArea: "быт", decision: "approve" }, { lifeArea: "быт", decision: "approve" },
      { lifeArea: "работа", decision: "reject" }, { lifeArea: "работа", decision: "reject" },
      { lifeArea: null, decision: "approve" },
    ]);
    expect(weights["быт"]).toBeGreaterThan(weights["работа"]);
    expect(weights["питомцы"]).toBeUndefined();
  });
});

describe("пул сцен: окно повтора 7 суток и область", () => {
  const scene = (text: string, area: string, extra: Record<string, unknown> = {}) => ({
    id: `s-${text.slice(0, 4)}`, scene: text, reaction: "посмеяться", why: "потому что", area, foundAt: ago(1), ...extra,
  });

  it("сцену прошлой недели повторять можно, позавчерашнюю — нет", () => {
    const text = "Бывший через год лайкнул фото в два ночи и через минуту убрал лайк";
    const old: ThreadsMaterialPool = { scoutedAt: ago(9), scenes: [scene(text, "бывший", { foundAt: ago(9), usedAt: ago(8), usedBy: "x" })] };
    expect(mergeScenes(old, [{ scene: text, reaction: "r", why: "w" }], NOW).scenes).toHaveLength(2);
    const recent: ThreadsMaterialPool = { scoutedAt: ago(2), scenes: [scene(text, "бывший", { foundAt: ago(2), usedAt: ago(2), usedBy: "x" })] };
    expect(mergeScenes(recent, [{ scene: text, reaction: "r", why: "w" }], NOW).scenes).toHaveLength(1);
  });

  it("перефразированная та же сцена отсекается по шинглам", () => {
    expect(scenesSimilar(
      "Бывший через год лайкнул фото в два ночи и через минуту убрал лайк",
      "Бывший через год лайкнул фото в два ночи, потом убрал лайк",
    )).toBe(true);
    expect(scenesSimilar("Свекровь пришла проверить холодильник", "Начальница написала в 18:55 про срочное")).toBe(false);
  });

  it("сцена берётся из области, где за неделю меньше всего постов", () => {
    const pool: ThreadsMaterialPool = {
      scoutedAt: ago(1),
      scenes: [
        scene("бытовая сцена про ключи и дверь которая захлопнулась", "быт"),
        scene("сцена про начальницу и письмо в шесть вечера пятницы", "начальница", { foundAt: ago(0.5) }),
        scene("ещё бытовая сцена про стиралку и носок", "быт", { usedAt: ago(1), usedBy: "z", foundAt: ago(3) }),
        scene("и ещё бытовая про чайник который кипел всю ночь", "быт", { usedAt: ago(2), usedBy: "y", foundAt: ago(3) }),
      ],
    };
    const result = takeScene(pool, "pub-1", NOW);
    expect(result.scene?.area).toBe("начальница");
    expect(result.claimed).toBe(true);
  });
});

describe("промт и Google-источник", () => {
  it("промт называет области и просит поле area; без списка прежний формат", () => {
    expect(scoutPrompt(["пост"], ["быт", "работа"])).toContain('"area":"..."');
    expect(scoutPrompt(["пост"], ["быт", "работа"])).toContain("быт; работа");
    expect(scoutPrompt(["пост"])).not.toContain('"area"');
  });

  it("без ключа Google молчит, с ключом отдаёт заголовок и сниппет, сбой запроса не бросает", async () => {
    expect(await fetchGoogleTrendTexts({ topics: ["быт"], key: null, cx: null })).toEqual([]);
    const ok = jest.fn(async () => new Response(JSON.stringify({ items: [
      { title: "Пост про бывшего", snippet: "Он написал в три ночи и сразу удалил сообщение, а я уже сделала скрин" },
      { title: "коротко", snippet: "x" },
    ] })));
    const texts = await fetchGoogleTrendTexts({ topics: ["бывший"], key: "k", cx: "c", fetchImpl: ok as unknown as typeof fetch });
    expect(texts).toHaveLength(1);
    expect(String((ok.mock.calls[0] as unknown[])[0])).toContain("site%3Athreads.com");
    const fail = jest.fn(async () => new Response("no", { status: 429 }));
    expect(await fetchGoogleTrendTexts({ topics: ["бывший"], key: "k", cx: "c", fetchImpl: fail as unknown as typeof fetch })).toEqual([]);
  });
});
