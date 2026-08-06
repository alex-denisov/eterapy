/**
 * B681 — кому показывать «карту дня».
 *
 * Проверяется ровно то, что нельзя увидеть глазами за один заход: порядок двух
 * гейтов и то, что `PREVIEW` не считается пройденной услугой.
 */
import { SYMBOLIC_PRODUCT_DEFINITIONS } from "@/lib/symbolic-products";

const findFirst = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: { productResult: { findFirst: (...args: unknown[]) => findFirst(...args) } },
}));

import {
  ESOTERIC_PRODUCT_KEYS,
  hasCompletedEsotericService,
  shouldShowTarotDay,
} from "@/lib/tarot-day-audience";

beforeEach(() => {
  findFirst.mockReset();
});

describe("список эзотерических ключей", () => {
  it("содержит все символические услуги каталога", () => {
    // Список в `tarot-day-audience` задан строками, чтобы не тянуть AI-слой.
    // Этот прогон — единственное, что удержит его в синхроне с каталогом:
    // новая символическая услуга должна попасть в аудиторию карты дня.
    for (const definition of SYMBOLIC_PRODUCT_DEFINITIONS) {
      expect(ESOTERIC_PRODUCT_KEYS).toContain(definition.productKey);
    }
  });

  it("включает совместимость по дате и НЕ включает legacy-«Вместе»", () => {
    expect(ESOTERIC_PRODUCT_KEYS).toContain("compatibility-by-date");
    // `compatibility` — движок «Вместе», он психологический
    // (project_service_slugs_renamed). Попадание сюда показало бы карту дня
    // ровно тем, кого владелец просил не смущать.
    expect(ESOTERIC_PRODUCT_KEYS).not.toContain("compatibility");
  });
});

describe("hasCompletedEsotericService", () => {
  it("спрашивает только готовые и неудалённые результаты эзотерических услуг", async () => {
    findFirst.mockResolvedValue({ id: "r1" });

    await expect(hasCompletedEsotericService("u1")).resolves.toBe(true);

    const where = findFirst.mock.calls[0][0].where;
    expect(where.status).toBe("READY");
    expect(where.deletedAt).toBeNull();
    expect(where.productKey.in).toEqual(expect.arrayContaining(["tarot", "natal-chart"]));
    // PREVIEW заводится ещё до оплаты (api/products/symbolic/route.ts): человек,
    // открывший страницу услуги и ушедший, услугу не проходил.
    expect(where.productKey.in).not.toContain("reframe");
  });

  it("без готового результата отвечает нет", async () => {
    findFirst.mockResolvedValue(null);
    await expect(hasCompletedEsotericService("u1")).resolves.toBe(false);
  });
});

describe("порядок гейтов", () => {
  it("скрытие сильнее аудитории и не ходит в базу", async () => {
    await expect(shouldShowTarotDay({ userId: "u1", tarotDayHidden: true })).resolves.toBe(false);
    // Человек, убравший блок, не должен увидеть его снова после следующей
    // покупки расклада — значит проверять аудиторию уже незачем.
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("не скрыт, но услугу не проходил — блока нет", async () => {
    findFirst.mockResolvedValue(null);
    await expect(shouldShowTarotDay({ userId: "u1", tarotDayHidden: false })).resolves.toBe(false);
  });

  it("не скрыт и услугу проходил — блок есть", async () => {
    findFirst.mockResolvedValue({ id: "r1" });
    await expect(shouldShowTarotDay({ userId: "u1", tarotDayHidden: false })).resolves.toBe(true);
  });
});
