/**
 * B743 — заявленное поле коннектора обязано иметь дорогу на прод.
 *
 * ⚠ ЖИВОЙ СЛУЧАЙ, РАДИ КОТОРОГО ПРОГОН И ЗАВЕДЁН. Владелец 2026-09-13: «в
 * списке площадок Max значится как не настроенный, хотя у меня все креды были
 * предоставлены». Креды действительно были — и панель не врала. Поля
 * `MAX_BOT_TOKEN`, `MAX_BOT_ID`, `MAX_CHANNEL_ID` были объявлены в
 * суперадминке ещё в B722, чтение их устроено правильно (сначала настройка в
 * базе, потом окружение), а доставки на прод не было ВОВСЕ: ни строки в
 * `deploy.yml`, ни в `.env.example`. Значение лежало у владельца, код его ждал,
 * и между ними не было дороги.
 *
 * Это ровно тот класс, который платформа уже называла по имени: механизм с
 * ручным шагом — это невыполненный механизм. Поле, которое надо не забыть
 * ввести руками, однажды не вводится, и площадка молча не работает месяцами.
 *
 * ⚠ ПОЧЕМУ ПРОГОН ЧИТАЕТ WORKFLOW, А НЕ ПРОВЕРЯЕТ ЗНАЧЕНИЯ. Значений здесь
 * быть не может и не должно. Проверяется единственное, что проверяемо в
 * прогоне и при этом ловит весь класс: у каждого ОБЯЗАТЕЛЬНОГО поля есть либо
 * строка доставки, либо явная запись в списке исключений с объяснением. Список
 * пополняется решением, а не молчанием.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MARKETING_PLATFORM_FIELDS } from "@/lib/marketing/platform-settings";

const deployWorkflow = readFileSync(
  join(process.cwd(), "..", ".github", "workflows", "deploy.yml"),
  "utf8",
);

/**
 * Поля, которые выкаткой НЕ доезжают, и это верно.
 *
 * У каждой строки обязано быть основание, и оно записано здесь же: иначе
 * список превратится в место, куда сметают неудобные находки.
 */
const PANEL_ONLY: Record<string, string> = {
  // Токен сообщества и его id владелец ввёл в суперадминке, и площадка
  // работает: значения лежат в `platformSetting` и переживают выкатку. Вносить
  // их ещё и секретами значило бы завести второй источник правды про один
  // токен — и однажды они разойдутся.
  VK_COMMUNITY_TOKEN: "введён в суперадминке, VK публикует",
  VK_COMMUNITY_ID: "введён в суперадминке, VK публикует",
};

/** Синонимы имени переменной: доставка может идти под прежним именем. */
const ENV_ALIASES: Record<string, readonly string[]> = {
  TELEGRAM_CHANNEL_ID: ["TELEGRAM_ETERAPY_CHANNEL_ID"],
  TELEGRAM_DISCUSSION_CHAT_ID: ["TELEGRAM_ETERAPY_CHAT_ID"],
};

function deliveredByDeploy(key: string): boolean {
  return [key, ...(ENV_ALIASES[key] ?? [])].some((name) => deployWorkflow.includes(name));
}

describe("B743 — у обязательного поля коннектора есть дорога на прод", () => {
  it("каждое обязательное поле доезжает выкаткой или объявлено ручным", () => {
    const orphans = MARKETING_PLATFORM_FIELDS
      // Поле без явного `requirement` обязательно по умолчанию — так же, как
      // его читает `marketingConnectorStates`.
      .filter((field) => !("requirement" in field))
      .map((field) => field.key)
      .filter((key) => !deliveredByDeploy(key) && !(key in PANEL_ONLY));
    // Сообщение важнее проверки: оно называет ровно те поля, которые ждут
    // значения, которого им никто не привезёт.
    expect(orphans).toEqual([]);
  });

  it("MAX доезжает всеми тремя полями: без любого из них канал не публикует", () => {
    expect(deliveredByDeploy("MAX_BOT_TOKEN")).toBe(true);
    expect(deliveredByDeploy("MAX_BOT_ID")).toBe(true);
    expect(deliveredByDeploy("MAX_CHANNEL_ID")).toBe(true);
  });

  it("доставка объявлена в обоих местах: в окружении шага и в списке переноса", () => {
    /**
     * ⚠ ДВЕ ПОЛОВИНЫ, И ОБЕ ОБЯЗАТЕЛЬНЫ. Первая — `KEY: ${{ secrets.KEY }}` в
     * окружении шага: без неё значение не попадает в сам процесс выкатки.
     * Вторая — имя в списке цикла, который переносит переменные в `.env` на
     * машине: без неё значение доедет до раннера и там же умрёт. Забыть вторую
     * особенно легко, потому что первая выглядит как готовая доставка.
     */
    for (const key of ["MAX_BOT_TOKEN", "MAX_BOT_ID", "MAX_CHANNEL_ID", "DZEN_CHANNEL_URL"]) {
      expect(deployWorkflow).toContain(`${key}: \${{ secrets.${key} }}`);
      const transferList = deployWorkflow.slice(deployWorkflow.indexOf("for key in"));
      expect(transferList).toContain(key);
    }
  });

  it("список ручных полей не растёт молча: у каждого записано основание", () => {
    for (const [key, reason] of Object.entries(PANEL_ONLY)) {
      expect(reason.length).toBeGreaterThan(15);
      expect(MARKETING_PLATFORM_FIELDS.some((field) => field.key === key)).toBe(true);
    }
  });
});
