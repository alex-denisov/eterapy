/**
 * B702 — цена прохода планировщика на ЖИВЫХ данных.
 *
 * Остальные прогоны B702 работают на контролируемой библиотеке из трёх статей и
 * снимке спроса из одной фразы: так проверяется решение, но не его цена.
 * Настоящий вход другой — 1750 фраз семантического ядра против 174 одобренных
 * статей библиотеки, и планировщик зовёт scorer по каждой строке кандидата.
 *
 * Замер 2026-08-11 до правки: 16 секунд на восемь слотов — матчер спроса
 * пересобирался (стемминг всех 1750 фраз) на КАЖДЫЙ вызов scorer'а. Проход
 * крона столько не ждёт, а тесты на моках этого не видят вовсе. Отсюда бюджет
 * ниже: он ловит возврат квадратичной сборки, а не микросекунды.
 */

import fs from "node:fs";
import path from "node:path";

import { demandFromCore, mergeDemandSignals } from "@/lib/marketing/content-relevance";
import { planTopicsForSlots } from "@/lib/marketing/planner";
import { CONTENT_PLAN } from "@/lib/marketing/content-plan";

/** Потолок прохода планировщика на живом входе. После правки — доли секунды. */
const PLANNER_BUDGET_MS = 3_000;

describe("B702 — планировщик на живом ядре и живой библиотеке", () => {
  it(`восемь слотов планируются быстрее ${PLANNER_BUDGET_MS} мс`, () => {
    const signals = mergeDemandSignals([demandFromCore()]);
    expect(signals.items.length).toBeGreaterThan(1_000);

    const slots = CONTENT_PLAN.slice(0, 8);
    const started = Date.now();
    const planned = planTopicsForSlots({
      slots,
      signals,
      trends: [],
      usedByPlatform: new Map(),
    });
    const elapsed = Date.now() - started;

    expect(planned.size).toBe(slots.length);
    expect(elapsed).toBeLessThan(PLANNER_BUDGET_MS);
  });

  it("ранжирует статьи, а не раздаёт их по алфавиту", () => {
    // Замер в контейнере стенда 2026-08-11: у всех восьми слотов балл был один
    // и тот же (1682.7), потому что scorer мерил КЛАСТЕР, а не статью. Выбор
    // при равных баллах решает тай-брейк по слагу — планировщик выглядел
    // работающим и выдавал алфавит. Подпись вырожденного ранжирования — именно
    // РАВЕНСТВО баллов, поэтому прогон смотрит на разброс обоснований.
    const signals = mergeDemandSignals([demandFromCore()]);
    const planned = planTopicsForSlots({
      slots: CONTENT_PLAN.slice(0, 8),
      signals,
      trends: [],
      usedByPlatform: new Map(),
    });

    const rationales = [...planned.values()].map((topic) => topic.rationale);
    expect(rationales.every((line) => line.startsWith("Тема из спроса"))).toBe(true);
    // Баллы зашиты в обоснование — если ранжирование живое, они различаются.
    expect(new Set(rationales).size).toBeGreaterThan(1);

    const slugs = [...planned.values()].map((topic) => topic.articleSlug);
    expect([...slugs].sort((left, right) => left.localeCompare(right))).not.toEqual(slugs);
  });
});

describe("B702 — гейт планировщика приезжает выкаткой", () => {
  it("стенд включает планировщик оверлеем, а не рукой на хосте", () => {
    // Владелец 2026-07-22: «я не буду ничего руками на проде делать, это всё
    // должно делаться только через выкатку». Значение, которое надо вписать в
    // `/opt/eterapy-staging/.env` руками, до контура не доезжает — механизм с
    // ручным шагом считается невыполненным. Оверлей едет scp каждой выкаткой.
    const overlay = fs.readFileSync(
      path.join(path.resolve(process.cwd(), ".."), "deploy/compose/docker-compose.staging.yml"),
      "utf8",
    );
    expect(overlay).toContain('MARKETING_PLANNER_ENABLED: "true"');
  });
});
