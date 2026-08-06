/**
 * B684 — карта дня меняется по расписанию, а не в полночь.
 *
 * До этой правки карта выбиралась по КАЛЕНДАРНЫМ МСК-суткам (`mskDayKey`), то
 * есть менялась в 00:00 МСК, а рассылка уходила в 7:00/9:00. Семь часов подряд
 * человек видел в кабинете уже НОВУЮ карту, про которую ему ещё не написали, а
 * утреннее сообщение приходило про карту, которую он успел посмотреть ночью.
 * Расписание владельца — «7 утра по будням, 9 утра по выходным» — относится к
 * смене карты, поэтому рубеж суток здесь один и тот же для экрана и для бота.
 *
 * МСК = UTC+3 круглый год, поэтому в тестах время задаётся в UTC.
 */
import {
  mskDayKey,
  tarotDayDueHourMsk,
  tarotDayKey,
  tarotDayPick,
} from "@/lib/tarot-day";

describe("B684 — рубеж суток карты дня", () => {
  it("календарные МСК-сутки остаются календарными", () => {
    // 2026-08-05 20:59 UTC = 23:59 МСК того же дня.
    expect(mskDayKey(new Date("2026-08-05T20:59:00Z"))).toBe("2026-08-05");
    expect(mskDayKey(new Date("2026-08-05T21:00:00Z"))).toBe("2026-08-06");
  });

  it("час смены: 7 по будням, 9 по выходным", () => {
    expect(tarotDayDueHourMsk(new Date("2026-08-05T09:00:00Z"))).toBe(7); // среда
    expect(tarotDayDueHourMsk(new Date("2026-08-08T09:00:00Z"))).toBe(9); // суббота
    expect(tarotDayDueHourMsk(new Date("2026-08-09T09:00:00Z"))).toBe(9); // воскресенье
  });

  it("в будни карта меняется ровно в 07:00 МСК", () => {
    // 03:59 UTC = 06:59 МСК среды — ещё вторник.
    expect(tarotDayKey(new Date("2026-08-05T03:59:00Z"))).toBe("2026-08-04");
    expect(tarotDayKey(new Date("2026-08-05T04:00:00Z"))).toBe("2026-08-05");
  });

  it("в выходные карта меняется ровно в 09:00 МСК", () => {
    // Суббота 07:00 МСК — рубеж выходного ещё не наступил.
    expect(tarotDayKey(new Date("2026-08-08T04:00:00Z"))).toBe("2026-08-07");
    expect(tarotDayKey(new Date("2026-08-08T05:59:00Z"))).toBe("2026-08-07");
    expect(tarotDayKey(new Date("2026-08-08T06:00:00Z"))).toBe("2026-08-08");
  });

  it("понедельник до 7 утра показывает воскресную карту", () => {
    // Воскресная карта началась в вс 09:00 МСК и держится до пн 07:00 МСК.
    expect(tarotDayKey(new Date("2026-08-10T03:59:00Z"))).toBe("2026-08-09");
    expect(tarotDayKey(new Date("2026-08-10T04:00:00Z"))).toBe("2026-08-10");
  });

  it("в полночь карта НЕ меняется", () => {
    const beforeMidnight = new Date("2026-08-05T20:00:00Z"); // ср 23:00 МСК
    const afterMidnight = new Date("2026-08-05T21:30:00Z"); // чт 00:30 МСК
    expect(tarotDayKey(beforeMidnight)).toBe("2026-08-05");
    expect(tarotDayKey(afterMidnight)).toBe("2026-08-05");
    expect(tarotDayPick("user-1", afterMidnight).key)
      .toBe(tarotDayPick("user-1", beforeMidnight).key);
  });

  it("после рубежа карта другая", () => {
    const before = new Date("2026-08-05T21:30:00Z"); // чт 00:30 МСК — ещё среда
    const after = new Date("2026-08-06T04:00:00Z"); // чт 07:00 МСК — четверг
    expect(tarotDayPick("user-1", before).dayKey).toBe("2026-08-05");
    expect(tarotDayPick("user-1", after).dayKey).toBe("2026-08-06");
  });

  it("сутки карты идут без пропусков и повторов через выходные", () => {
    // Каждый час с пятницы до вторника даёт непрерывную цепочку дат.
    const seen: string[] = [];
    for (let hour = 0; hour < 24 * 5; hour++) {
      const at = new Date(Date.UTC(2026, 7, 7, hour)); // с 2026-08-07 00:00 UTC
      const key = tarotDayKey(at);
      if (seen[seen.length - 1] !== key) seen.push(key);
    }
    expect(seen).toEqual([
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
      "2026-08-10",
      "2026-08-11",
    ]);
  });
});
