/**
 * B733 — THREADS ИДЁТ РАЗНЫМИ ФОРМАТАМИ, А НЕ ОДНИМ СЦЕНАРИЕМ.
 *
 * Замер прода за 30 суток: 142 поста, лучший по просмотрам — 66 (threads).
 * Причина названа владельцем прямо: один сценарий, один тон, одно расписание.
 * У слота были тема и контракт площадки, но не было ПОНЯТИЯ ФОРМАТА.
 *
 * Прогон меряет ровно то, что можно померить без ленты: формат объявлен слотом,
 * его требования доезжают до автора и до редактора, расписание перестало быть
 * ровным. Работает ли формат — покажет замер просмотров по форматам за 14 суток
 * (B729 даёт числа), а не этот файл.
 */

import { contentPlanFor } from "@/lib/marketing/content-plan";
import {
  THREADS_FORMATS,
  postFormatByLabel,
  threadsFormatFor,
} from "@/lib/marketing/post-formats";
import {
  MARKETING_AGENT_SYSTEM_PROMPT,
  MARKETING_REVIEWER_SYSTEM_PROMPT,
} from "@/lib/marketing/agent-prompt";

describe("B733 — форматы постов Threads", () => {
  it("библиотека форматов покрывает названные владельцем конструкции", () => {
    const labels = THREADS_FORMATS.map((format) => format.label);
    // Владелец назвал: шутка/сатира над индустрией, острый вопрос, вброс,
    // короткая реплика без картинки, скриншот переписки, непопулярное мнение,
    // микро-история.
    expect(labels).toEqual(expect.arrayContaining([
      "сатира над индустрией",
      "я и мой психолог",
      "непопулярное мнение",
      "острый вопрос",
      "вброс-наблюдение",
      "скриншот переписки",
      "микро-история",
    ]));
    expect(THREADS_FORMATS.length).toBeGreaterThanOrEqual(7);

    for (const format of THREADS_FORMATS) {
      // У формата есть КОНСТРУКЦИЯ и образец: «напиши вирусный пост» без формы
      // и есть то, что давало один сценарий на всю ленту.
      expect(format.construction.length).toBeGreaterThan(40);
      expect(format.example.length).toBeGreaterThan(10);
      expect(format.weight).toBeGreaterThan(0);
      // Пост-шутка освобождена от пользы и призыва ЯВНО: без такой строки
      // редактор режет её по общей рубрике (см. B734).
      expect(format.rules.join(" ")).toMatch(/польза .*НЕ нужна/i);
      expect(format.rules.join(" ")).toMatch(/cta = 5|Призыв и ссылка НЕ нужны/i);
    }

    // Большинство форматов выходит БЕЗ картинки: «посты в Threads не
    // обязательно вообще должны иметь скриншоты» (владелец 2026-09-08).
    const textOnly = THREADS_FORMATS.filter((format) => format.media === "none");
    expect(textOnly.length).toBeGreaterThan(THREADS_FORMATS.length / 2);
    // Скриншот переписки остаётся одним из форматов, а не единственным видом.
    expect(THREADS_FORMATS.filter((format) => format.media === "chat_mockup")).toHaveLength(1);
  });

  it("формат — поле слота, а не догадка автора", () => {
    const slots = contentPlanFor(new Date("2026-09-10T09:00:00+03:00"))
      .filter((slot) => slot.channel === "threads");
    expect(slots.length).toBeGreaterThan(3);

    for (const slot of slots) {
      const format = postFormatByLabel(slot.format);
      expect(format).not.toBeNull();
      // Требования формата уходят в реестр вместе со слотом: редактор увидит
      // их в задаче, а не догадается по названию.
      expect(slot.formatRules).toEqual(format!.rules);
      expect(slot.formatMedia).toBe(format!.media);
      expect(slot.editorialAngle).toBe(format!.construction);
    }

    // Лента идёт не одним сценарием: за две недели встречается больше трёх
    // форматов. Прежде их было ровно два на всю ленту.
    const used = new Set(slots.map((slot) => slot.format));
    expect(used.size).toBeGreaterThan(3);
  });

  it("расписание неровное — не «две штуки каждые сутки»", () => {
    // Один прогон плана, а не сумма по нескольким: окно пересобирается «от
    // завтра» каждый заход, и одна и та же дата попала бы в счёт несколько раз
    // ([[reference_sliding_window_positions_are_not_dates]]).
    const perDay = new Map<string, number>();
    for (const slot of contentPlanFor(new Date("2026-09-10T09:00:00+03:00"))) {
      if (slot.channel !== "threads") continue;
      const day = slot.scheduledAt.slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    expect(perDay.size).toBeGreaterThan(3);
    const counts = new Set(perDay.values());
    expect(counts.size).toBeGreaterThan(1);
    // Больше двух в сутки поставить нельзя: у Threads объявлены два времени
    // суток, и третий слот молча исчезал бы (тот же разрыв, что B713 нашёл
    // у Telegram).
    for (const count of perDay.values()) {
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(2);
    }
    // И час выпуска не повторяется изо дня в день: джиттер B718 разводит его
    // внутри времени суток.
    const times = new Set(
      contentPlanFor(new Date("2026-09-10T09:00:00+03:00"))
        .filter((slot) => slot.channel === "threads")
        .map((slot) => slot.scheduledAt.slice(11, 16)),
    );
    expect(times.size).toBeGreaterThan(2);
  });

  it("выбор формата детерминирован и распределён по весам", () => {
    const seen = new Map<string, number>();
    for (let day = 0; day < 60; day += 1) {
      for (let sequence = 0; sequence < 2; sequence += 1) {
        const format = threadsFormatFor(day, sequence);
        expect(threadsFormatFor(day, sequence).label).toBe(format.label);
        seen.set(format.label, (seen.get(format.label) ?? 0) + 1);
      }
    }
    // Все форматы выходят хотя бы раз: формат с весом, который не выпадает
    // никогда, — это мёртвая строка в библиотеке.
    expect(seen.size).toBe(THREADS_FORMATS.length);
    // Отрицательный номер суток (даты до эпохи) не уводит выбор за границы.
    expect(threadsFormatFor(-13, 1)).toBeDefined();
  });

  it("правила формата объявлены сильнее рубрики И автору, И редактору", () => {
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toContain("formatRules");
    expect(MARKETING_AGENT_SYSTEM_PROMPT).toMatch(/БЕЗ пользы и БЕЗ призыва/);
    expect(MARKETING_REVIEWER_SYSTEM_PROMPT).toContain("formatRules");
    expect(MARKETING_REVIEWER_SYSTEM_PROMPT).toMatch(/ОТМЕНЯЮТ\s+соответствующие пункты рубрики/);
    // Дописанная мораль в таком посте — дефект, а не подстраховка.
    expect(MARKETING_REVIEWER_SYSTEM_PROMPT).toMatch(/ДЕФЕКТОМ и снижают оценку/);
  });
});
