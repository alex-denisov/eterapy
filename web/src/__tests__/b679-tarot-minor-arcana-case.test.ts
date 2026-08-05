/**
 * B679 — младший аркан называется в родительном падеже.
 *
 * Замечание владельца 2026-08-06: «Младшие арканы в колоде должны быть в
 * правильном падеже всегда». Имя карты склеивалось из именительных форм и
 * читалось как «Двойка Кубки» — во всех местах сразу: карта дня в кабинете и
 * мини-аппе, утренняя рассылка, расклады Таро, «Арканы судьбы».
 *
 * Прогон держит границу с двух сторон: правильный падеж в имени и живая
 * совместимость со СТАРЫМИ именами в сохранённых результатах.
 */

import { TAROT_DECK, tarotDeckCardByName } from "@/lib/tarot-deck";

const MINOR = TAROT_DECK.filter((card) => card.arcana === "minor");

const NOMINATIVE_SUITS = ["Жезлы", "Кубки", "Мечи", "Пентакли"] as const;
const GENITIVE_SUITS = ["Жезлов", "Кубков", "Мечей", "Пентаклей"] as const;

describe("B679: падеж масти в имени младшего аркана", () => {
  it("колода собрана целиком: 22 старших и 56 младших", () => {
    expect(TAROT_DECK).toHaveLength(78);
    expect(MINOR).toHaveLength(56);
  });

  it("ни одно имя не оканчивается именительной формой масти", () => {
    const wrong = MINOR.filter((card) =>
      NOMINATIVE_SUITS.some((suit) => card.name.endsWith(` ${suit}`)));
    expect(wrong.map((card) => card.name)).toEqual([]);
  });

  it("каждое имя оканчивается родительной формой своей масти", () => {
    for (const card of MINOR) {
      const genitive = GENITIVE_SUITS.find((suit) => card.name.endsWith(` ${suit}`));
      expect(genitive).toBeDefined();
      expect(card.name).toBe(`${card.rank} ${genitive}`);
    }
  });

  it("масть в поле suit остаётся именительной — это название масти, а не часть имени", () => {
    for (const card of MINOR) {
      expect(NOMINATIVE_SUITS).toContain(card.suit as (typeof NOMINATIVE_SUITS)[number]);
    }
  });

  it("точечная проверка узнаваемых карт", () => {
    const names = MINOR.map((card) => card.name);
    expect(names).toContain("Двойка Кубков");
    expect(names).toContain("Король Мечей");
    expect(names).toContain("Туз Жезлов");
    expect(names).toContain("Десятка Пентаклей");
    expect(names).not.toContain("Двойка Кубки");
    expect(names).not.toContain("Король Мечи");
  });

  it("СТАРОЕ имя из сохранённых результатов по-прежнему находит ту же карту", () => {
    const legacy = tarotDeckCardByName("Двойка Кубки");
    const current = tarotDeckCardByName("Двойка Кубков");
    expect(legacy).not.toBeNull();
    expect(legacy?.code).toBe(current?.code);
    expect(legacy?.name).toBe("Двойка Кубков");
  });

  it("старое имя находится для всех 56 младших карт", () => {
    for (const card of MINOR) {
      const byLegacy = tarotDeckCardByName(`${card.rank} ${card.suit}`);
      expect(byLegacy?.code).toBe(card.code);
    }
  });

  it("старшие арканы падежом не затронуты", () => {
    expect(tarotDeckCardByName("Шут")?.code).toBe("major-00");
    expect(tarotDeckCardByName("Колесо Фортуны")?.code).toBe("major-10");
  });
});
