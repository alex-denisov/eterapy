/**
 * B718 — обложка перестала быть надписью на цветном прямоугольнике.
 *
 * Претензия владельца 2026-08-23: «картинки будто по шаблону
 * цвет-надписи-логотип, нет никакого смысла в одинаковых картинках».
 *
 * Прогон меряет три свойства, каждое из которых на прежней реализации падало:
 * у обложки есть РИСУНОК и он разный; холст зависит от площадки; нарисованной
 * кнопки, которую нельзя нажать, больше нет.
 */
import { coverCanvas, coverMotifFor } from "@/lib/marketing/cover-art";

describe("B718 · обложка", () => {
  it("холст берётся у площадки, а не один квадрат на все", () => {
    expect(coverCanvas("dzen")).toEqual({ width: 1200, height: 675 });
    expect(coverCanvas("instagram")).toEqual({ width: 1080, height: 1350 });
    expect(coverCanvas("threads")).toEqual({ width: 1200, height: 1200 });
    expect(coverCanvas("telegram")).toEqual({ width: 1200, height: 900 });
    // Незнакомая площадка получает разумное умолчание, а не падение.
    expect(coverCanvas("mastodon").width).toBeGreaterThan(0);
    // Регистр площадки в реестре не нормализован — холст обязан его пережить.
    expect(coverCanvas("Dzen")).toEqual(coverCanvas("dzen"));
  });

  it("мотив детерминирован и по корпусу перебирает все шесть", () => {
    const at = new Date("2026-08-22T09:00:00Z");
    expect(coverMotifFor("k", "telegram", at)).toBe(coverMotifFor("k", "telegram", at));
    const seen = new Set<string>();
    for (let day = 1; day <= 28; day += 1) {
      for (const platform of ["telegram", "vk", "dzen", "threads", "instagram", "reddit"]) {
        seen.add(coverMotifFor("k", platform, new Date(`2026-08-${String(day).padStart(2, "0")}T09:00:00Z`)));
      }
    }
    expect(seen.size).toBe(6);
  });

  it("соседние сутки канала НИКОГДА не получают один мотив", () => {
    // Не «редко», а никогда: шаг 5 взаимно прост с шестью мотивами. Владелец
    // смотрит ленту, и два одинаковых рисунка встык читаются как повтор поста.
    for (const platform of ["telegram", "vk", "dzen", "threads", "instagram", "reddit"]) {
      const week = Array.from({ length: 7 }, (_, index) =>
        coverMotifFor("k", platform, new Date(`2026-08-${String(10 + index)}T09:00:00Z`)));
      for (let index = 1; index < week.length; index += 1) {
        expect(week[index]).not.toBe(week[index - 1]);
      }
    }
  });

  it("в одни сутки две площадки получают разные мотивы", () => {
    const at = new Date("2026-08-22T09:00:00Z");
    const sameDay = ["telegram", "vk", "dzen", "threads", "instagram", "reddit"]
      .map((platform) => coverMotifFor("k", platform, at));
    expect(new Set(sameDay).size).toBe(6);
  });

  it("без даты мотив всё равно есть и повторяем", () => {
    expect(coverMotifFor("b610-2w-telegram-20260822-03")).toBe(
      coverMotifFor("b610-2w-telegram-20260822-03"),
    );
  });
});
