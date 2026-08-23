/**
 * B714 — гейт глубины библиотеки.
 *
 * 2026-08-17 Яндекс вынес «Библиотеку вопросов» из индекса целиком: 219
 * страниц → 43. Технических причин не было — 200, canonical, JSON-LD и sitemap
 * проверены на проде. Причина в данных: 199 адресов из 251 несли ≈60
 * уникальных слов каждый, потому что в модели записи НЕ БЫЛО поля под
 * развёрнутый ответ.
 *
 * Владелец 2026-08-23: «Мне не нужны пустые страницы ради текста, мне нужна
 * осмысленная библиотека с CTA и обязательно чтобы она выполняла свою
 * функцию».
 */

import { anonymousLibraryEntries, approvedLibraryEntries, indexableLibraryEntries } from "@/data/anonymous-library";
import {
  LIBRARY_MIN_OWN_WORDS,
  isEchoOf,
  libraryDepth,
  libraryOwnWordCount,
} from "@/lib/library-depth";
import { libraryChecks, libraryFaqs, libraryFirstStep } from "@/lib/library-editorial";

describe("B714 — глубина вычисляется, а не проставляется", () => {
  it("тонкая карточка не проходит и объясняет, чего ей не хватает", () => {
    const thin = anonymousLibraryEntries.find((e) => e.slug === "ne-mogu-reshitsya-na-razgovor");
    expect(thin).toBeDefined();
    const verdict = libraryDepth(thin!);
    expect(verdict.indexable).toBe(false);
    // Молчаливый отказ — тот самый вид отказа, из-за которого корпус умер
    // незаметно. Гейт обязан называть причину.
    expect(verdict.missing.length).toBeGreaterThan(0);
    expect(verdict.missing.join(" ")).toContain("body");
  });

  it("признак `indexable` из данных больше ни на что не влияет", () => {
    // Он стоял `true` у ВСЕХ 199 записей — потому что его ставил автор
    // карточки, а не свойство карточки.
    const flagged = anonymousLibraryEntries.filter((e) => e.indexable && e.status === "approved");
    expect(flagged.length).toBeGreaterThan(150);
    expect(indexableLibraryEntries().length).toBeLessThan(flagged.length / 2);
  });

  it("каталог людям не сократился ни на одну карточку", () => {
    const approved = anonymousLibraryEntries.filter((e) => e.status === "approved");
    expect(approvedLibraryEntries().length).toBe(approved.length);
    expect(approvedLibraryEntries().length).toBeGreaterThan(indexableLibraryEntries().length);
  });
});

describe("B714 — что именно попало в индекс", () => {
  const deep = indexableLibraryEntries();

  it("каждая проходящая запись длиннее рубежа собственными словами", () => {
    expect(deep.length).toBeGreaterThan(0);
    for (const entry of deep) {
      expect(libraryOwnWordCount(entry)).toBeGreaterThanOrEqual(LIBRARY_MIN_OWN_WORDS);
    }
  });

  it("корпус арканов остался в индексе: это единственный материал с позициями", () => {
    // Замер Вебмастера: арканы берут позиции 5–12. Гейт, снявший бы их с
    // индекса, чинил бы не ту проблему.
    const arcana = deep.filter((e) => /arkan/.test(e.slug));
    expect(arcana.length).toBe(22);
  });

  it("пять записей услуг получили собственный разбор и прошли редакционную норму", () => {
    const guides = deep.filter((e) => !/arkan/.test(e.slug));
    expect(guides.length).toBe(5);
    for (const entry of guides) {
      expect(entry.body?.length ?? 0).toBeGreaterThanOrEqual(2);
      // 600–900 слов — редакционная норма для вновь написанного материала.
      expect(libraryOwnWordCount(entry)).toBeGreaterThanOrEqual(600);
    }
  });

  it("разбор не пересказывает корпус услуги, а отвечает на другие вопросы", () => {
    for (const entry of deep.filter((e) => e.body?.length)) {
      const printed = [entry.summary, entry.mainFork?.note ?? "", ...entry.perspectives];
      for (const section of entry.body ?? []) {
        for (const paragraph of section.paragraphs) {
          expect(isEchoOf(paragraph, printed)).toBe(false);
        }
      }
    }
  });
});

describe("B714 — самоповтор снят", () => {
  it("ответ FAQ не повторяет то, что страница уже напечатала", () => {
    // Живая проверка до правки: на `/library/net-nastoyashchikh-druzey` фраза
    // «Близость строится через повторный контакт…» стояла ТРИЖДЫ.
    for (const entry of approvedLibraryEntries()) {
      const printed = [entry.summary, libraryFirstStep(entry), ...libraryChecks(entry)];
      for (const faq of libraryFaqs(entry)) {
        expect(isEchoOf(faq.answer, printed)).toBe(false);
      }
    }
  });

  it("повтор распознаётся и при частичном вхождении, а не только дословно", () => {
    expect(isEchoOf("Близость строится через повторный контакт и общие дела.",
      ["Близость строится через повторный контакт"])).toBe(true);
    expect(isEchoOf("Совсем другая мысль про другое.",
      ["Близость строится через повторный контакт"])).toBe(false);
  });
});
