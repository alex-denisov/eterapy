/**
 * B686 — в Дзене не должно появляться двух статей на одну тему.
 *
 * ЧТО СЛУЧИЛОСЬ. На канале 6 публикаций и 5 строк в очереди — и все пять
 * пересказывают уже вышедшее: три раза «карта Смерть», два раза «выгорание».
 * Владелец 2026-08-06: «нельзя допустить публикации дублирующего материала;
 * если произошла ошибка в генерации контента, значит весь дублирующий контент
 * нужно заменить новым».
 *
 * ПОЧЕМУ ЭТО БЫЛО НЕИЗБЕЖНО. Тема слота бралась по ПОЗИЦИИ дня внутри
 * скользящего окна: `dzenDays = [1,3,5,8,10,12]` и `topicAt(sequence, 4)`.
 * Окно пересобирается каждый день заново, `sequence` каждый раз начинается с
 * нуля — значит Дзену пожизненно доставались ровно шесть тем с 4-й по 9-ю, из
 * шестнадцати. Ровно эти шесть и вышли, с повторами. Никакая формулировка в
 * промте это не исправила бы: модель получала задание на уже занятую тему.
 *
 * ЧТО СТАЛО. Тема считается от КАЛЕНДАРНОЙ ДАТЫ (сдвиг окна её больше не
 * трогает), а перед созданием строки занятые темы площадки вычитаются — слот
 * получает первую свободную, а не остаётся дублем.
 */
import {
  TOPIC_COUNT,
  contentPlanFor,
  withUnusedTopic,
} from "@/lib/marketing/content-plan";

function dzenSlugsFor(day: string): string[] {
  return contentPlanFor(new Date(day))
    .filter((slot) => slot.channel === "dzen")
    .map((slot) => slot.articleSlug);
}

describe("B686 · тема слота не зависит от сдвига окна", () => {
  it("одна и та же дата получает одну и ту же тему в разных заходах", () => {
    // Окно строится «от завтра»: 1 и 3 августа перекрываются по датам, значит
    // общие даты обязаны нести одинаковые темы.
    const early = contentPlanFor(new Date("2026-08-01T09:00:00Z"));
    const later = contentPlanFor(new Date("2026-08-03T09:00:00Z"));
    const byKey = new Map(later.map((slot) => [slot.key, slot.articleSlug]));

    const overlapping = early.filter((slot) => byKey.has(slot.key));
    expect(overlapping.length).toBeGreaterThan(10);
    for (const slot of overlapping) {
      expect(byKey.get(slot.key)).toBe(slot.articleSlug);
    }
  });

  it("Дзен перестал жить на шести темах из шестнадцати", () => {
    // Месяц заходов подряд: набор тем Дзена обязан покрыть заметно больше
    // шести — иначе повторы вернутся сами собой.
    const seen = new Set<string>();
    for (let day = 0; day < 30; day++) {
      const at = new Date(Date.UTC(2026, 7, 1 + day, 9));
      dzenSlugsFor(at.toISOString()).forEach((slug) => seen.add(slug));
    }
    expect(seen.size).toBeGreaterThan(10);
    expect(TOPIC_COUNT).toBe(16);
  });

  it("в пределах одного окна у Дзена нет двух слотов на одну тему", () => {
    for (let day = 0; day < 30; day++) {
      const at = new Date(Date.UTC(2026, 7, 1 + day, 9)).toISOString();
      const slugs = dzenSlugsFor(at);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
  });
});

describe("B686 · занятая тема заменяется, а не повторяется", () => {
  const slot = contentPlanFor(new Date("2026-08-06T09:00:00Z"))
    .find((entry) => entry.channel === "dzen")!;

  it("свободная тема остаётся как есть", () => {
    expect(withUnusedTopic(slot, new Set())).toEqual(slot);
  });

  it("занятая тема подменяется на свободную", () => {
    const replaced = withUnusedTopic(slot, new Set([slot.articleSlug]));
    expect(replaced).not.toBeNull();
    expect(replaced!.articleSlug).not.toBe(slot.articleSlug);
    // Подменяется только тема: адрес слота, время и формат обязаны остаться —
    // иначе перевыпуск сдвинул бы расписание канала.
    expect(replaced!.key).toBe(slot.key);
    expect(replaced!.scheduledAt).toBe(slot.scheduledAt);
    expect(replaced!.format).toBe(slot.format);
    // И тема, и её поисковый запрос, и кластер меняются вместе — половинчатая
    // подмена дала бы статью про одно с запросом про другое.
    expect(replaced!.targetQuery).not.toBe(slot.targetQuery);
  });

  it("когда свободных тем не осталось — null, а не молчаливый дубль", () => {
    const everything = new Set(
      contentPlanFor(new Date("2026-08-06T09:00:00Z")).map((entry) => entry.articleSlug),
    );
    // В окне 14 дней встречаются все темы; если вдруг нет — добираем из слота.
    everything.add(slot.articleSlug);
    expect(everything.size).toBe(TOPIC_COUNT);
    expect(withUnusedTopic(slot, everything)).toBeNull();
  });
});
