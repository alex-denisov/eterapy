import { THREADS_FORMATS, postFormatByLabel } from "@/lib/marketing/post-formats";
import {
  SERIES_FORMAT, SERIES_TOTAL_DAYS, parseSeriesConfig, seriesDayFor, startSeries, stopSeries, seriesRules,
} from "@/lib/marketing/threads-series";
import { isCtaEligibleLabel } from "@/lib/marketing/threads-cta";
import { interpretOwnerMessage } from "@/lib/marketing/orchestrator-dialogue";

describe("B776 F2/F5: экспертный формат K28", () => {
  const k28 = THREADS_FORMATS.find((format) => format.cluster === "K28")!;
  it("есть, вес 2, продолжение цепочкой, без ссылки", () => {
    expect(k28.label).toBe("Если бы ко мне пришёл запрос");
    expect(k28.weight).toBe(2);
    expect(k28.reply).toBe("continuation");
    expect(k28.link).toBe(false);
    expect(k28.example).toMatch(/Если бы ко мне пришла девушка/);
    const rules = k28.rules.join("\n");
    expect(rules).toMatch(/ПРОБЛЕМА/);
    expect(rules).toMatch(/МОЙ ПЛАН/);
    expect(rules).toMatch(/ОБЪЯСНЕНИЕ/);
    expect(rules).toMatch(/не обещай/i);
    expect(rules).toMatch(/480/);
  });
  it("юмористические форматы остаются одиночными постами", () => {
    for (const format of THREADS_FORMATS.filter((item) => ["K4", "K3", "K5", "K14", "K15"].includes(item.cluster ?? ""))) {
      expect(format.reply).toBeUndefined();
    }
  });
  it("форматы цепочки имеют право на CTA", () => {
    expect(isCtaEligibleLabel(k28.label)).toBe(true);
    expect(isCtaEligibleLabel(SERIES_FORMAT.label)).toBe(true);
  });
});

describe("B776 F3: серия «День N/30»", () => {
  const active = { active: true, startDate: "2026-10-14", days: 30, title: "Истории" };
  it("формат серии K29: психология, цепочка, ищется по названию, не в общей ротации", () => {
    expect(SERIES_FORMAT.cluster).toBe("K29");
    expect(SERIES_FORMAT.reply).toBe("continuation");
    expect(THREADS_FORMATS.includes(SERIES_FORMAT)).toBe(false);
    expect(postFormatByLabel(SERIES_FORMAT.label, "threads")).toBe(SERIES_FORMAT);
  });
  it("по умолчанию серия не активна", () => {
    expect(parseSeriesConfig(null)).toBeNull();
    expect(parseSeriesConfig("не json")).toBeNull();
    expect(seriesDayFor(null, "2026-10-14")).toBeNull();
    expect(seriesDayFor({ ...active, active: false }, "2026-10-14")).toBeNull();
  });
  it("номер суток считается по МСК-датам от startDate + 1", () => {
    expect(seriesDayFor(active, "2026-10-13")).toBeNull();
    expect(seriesDayFor(active, "2026-10-14")).toEqual({ day: 1, total: 30, isAnnouncement: true });
    expect(seriesDayFor(active, "2026-10-15")).toEqual({ day: 2, total: 30, isAnnouncement: false });
    expect(seriesDayFor(active, "2026-11-12")?.day).toBe(30);
    expect(seriesDayFor(active, "2026-11-13")).toBeNull();
    expect(SERIES_TOTAL_DAYS).toBe(30);
  });
  it("разбор конфигурации отбрасывает мусор", () => {
    expect(parseSeriesConfig(JSON.stringify(active))).toEqual(active);
    expect(parseSeriesConfig(JSON.stringify({ active: true, startDate: "вчера", days: 30, title: "x" }))).toBeNull();
  });
  it("старт ставит завтрашнюю дату МСК, стоп гасит", () => {
    const started = startSeries(new Date("2026-10-13T21:30:00Z"));
    expect(started).toMatchObject({ active: true, startDate: "2026-10-15", days: 30 });
    expect(stopSeries(started).active).toBe(false);
  });
  it("правила дня: объявление и запреты", () => {
    const first = seriesRules({ day: 1, total: 30, isAnnouncement: true }).join("\n");
    expect(first).toMatch(/Паттерн дня 1\/30/);
    expect(first).toMatch(/Подпишись, чтобы не пропустить/);
    expect(first).toMatch(/30 дней/);
    const later = seriesRules({ day: 7, total: 30, isAnnouncement: false }).join("\n");
    expect(later).toMatch(/Паттерн дня 7\/30/);
    expect(later).toMatch(/не называй людей, места, даты, диагнозы и суммы/i);
    expect(later).toMatch(/не говори «из практики», «ко мне пришла», что сцена реальная или выдуманная/i);
    expect(later).toMatch(/не представляй eTerapy как источник результата/i);
  });
  it("команды владельца «серия старт» и «серия стоп»", () => {
    expect(interpretOwnerMessage("серия старт")).toEqual({ kind: "series_start" });
    expect(interpretOwnerMessage("Серия стоп")).toEqual({ kind: "series_stop" });
    expect(interpretOwnerMessage("серия, стоп!").kind).toBe("series_stop");
    expect(interpretOwnerMessage("стоп").kind).toBe("hold");
  });
});
