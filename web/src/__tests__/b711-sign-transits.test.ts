import { planetSignAt, signTransits } from "@/lib/astro/sign-transits";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

describe("B711 — периоды «планета в знаке»", () => {
  it("держит инвариант границ: внутри интервала знак тот, снаружи — другой", () => {
    // Единственная проверка, которая ловит съехавшее уточнение границы. Без неё
    // деление пополам может вернуть момент «почти входа», и таблица дат на
    // странице будет систематически врать на шаг грубого прохода.
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2027-01-01T00:00:00Z");
    for (const [planet, sign] of [["sun", "aries"], ["venus", "scorpio"], ["mars", "leo"]]) {
      for (const transit of signTransits(planet, sign, from, to)) {
        expect({
          planet,
          sign,
          justAfterStart: planetSignAt(planet, new Date(transit.start.getTime() + MINUTE_MS)).key,
          justBeforeEnd: planetSignAt(planet, new Date(transit.end.getTime() - MINUTE_MS)).key,
        }).toEqual({ planet, sign, justAfterStart: sign, justBeforeEnd: sign });

        if (!transit.clampedStart) {
          expect({
            planet,
            sign,
            beforeStart: planetSignAt(planet, new Date(transit.start.getTime() - HOUR_MS)).key,
          }).not.toEqual({ planet, sign, beforeStart: sign });
        }
      }
    }
  });

  it("Солнце проходит Овна один раз в год, во второй половине марта", () => {
    const transits = signTransits(
      "sun",
      "aries",
      new Date("2026-01-01T00:00:00Z"),
      new Date("2027-01-01T00:00:00Z"),
    );
    expect(transits).toHaveLength(1);
    const [aries] = transits;
    expect(aries.start.getUTCMonth()).toBe(2); // март
    expect(aries.start.getUTCDate()).toBeGreaterThanOrEqual(19);
    expect(aries.start.getUTCDate()).toBeLessThanOrEqual(21);
    const days = (aries.end.getTime() - aries.start.getTime()) / DAY_MS;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(32);
  });

  it("Луна возвращается в знак каждый месяц и стоит в нём около двух с половиной суток", () => {
    // Шаг грубого прохода для Луны обязан быть меньше её самого короткого
    // визита: при слишком крупном шаге часть визитов пропала бы молча, и
    // страница «луна в скорпионе» показала бы девять периодов вместо тринадцати.
    const transits = signTransits(
      "moon",
      "scorpio",
      new Date("2026-01-01T00:00:00Z"),
      new Date("2027-01-01T00:00:00Z"),
    );
    expect(transits.length).toBeGreaterThanOrEqual(12);
    expect(transits.length).toBeLessThanOrEqual(14);
    for (const transit of transits) {
      if (transit.clampedStart || transit.clampedEnd) continue;
      const days = (transit.end.getTime() - transit.start.getTime()) / DAY_MS;
      expect({ days: days > 2 && days < 3 }).toEqual({ days: true });
    }
  });

  it("Плутон стоит в Скорпионе в 1990 году и не стоит в 1975", () => {
    expect(planetSignAt("pluto", new Date("1990-01-01T00:00:00Z")).key).toBe("scorpio");
    expect(planetSignAt("pluto", new Date("1975-01-01T00:00:00Z")).key).not.toBe("scorpio");
  });

  it("не теряет вторую половину ретроградного визита", () => {
    // Плутон вошёл в Скорпион в ноябре 1983, ретроградно вернулся в Весы и
    // зашёл повторно в 1984-м. Реализация «один вход, один выход» отдала бы
    // здесь ровно один интервал и потеряла бы возврат.
    const transits = signTransits(
      "pluto",
      "scorpio",
      new Date("1983-01-01T00:00:00Z"),
      new Date("1986-01-01T00:00:00Z"),
    );
    expect(transits.length).toBeGreaterThanOrEqual(2);
    expect(transits[0].clampedStart).toBe(false);
  });

  it("помечает интервалы, обрезанные окном, а не выдаёт границу окна за вход", () => {
    // Окно целиком внутри стояния Плутона в Скорпионе: настоящих входа и выхода
    // в нём нет, и оба конца обязаны быть помечены как обрезанные.
    const from = new Date("1990-01-01T00:00:00Z");
    const to = new Date("1991-01-01T00:00:00Z");
    const transits = signTransits("pluto", "scorpio", from, to);
    expect(transits).toEqual([
      { start: from, end: to, clampedStart: true, clampedEnd: true },
    ]);
  });

  it("отвергает пустое окно и неизвестные имена", () => {
    const day = new Date("2026-01-01T00:00:00Z");
    expect(() => signTransits("moon", "scorpio", day, day)).toThrow(/окно поиска пустое/i);
    expect(() => signTransits("nibiru", "scorpio", day, new Date("2026-02-01T00:00:00Z")))
      .toThrow(/светило/i);
    expect(() => signTransits("moon", "ophiuchus", day, new Date("2026-02-01T00:00:00Z")))
      .toThrow(/знак/i);
  });
});
