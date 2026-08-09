/**
 * B699, вторая половина — остывающие провайдеры съедали бюджет обращений.
 *
 * После первой половины правки конвейер ожил: редактор снова получал модель,
 * отличную от модели автора (`mistral-medium-2604`), и успешно отрабатывал.
 * Материал всё равно не выходил — теперь он умирал иначе:
 *
 *   marketing-agent.draft_failed
 *   MarketingAttemptBudgetError: Материал израсходовал 12 обращений к моделям
 *
 * Замер прода 2026-08-09 15:27, один проход редактора:
 *
 *   marketing-reviewer:…:1:1:groq       ALL_PROVIDERS_FAILED
 *   marketing-reviewer:…:1:1:cohere     ALL_PROVIDERS_FAILED
 *   marketing-reviewer:…:1:1:openrouter ALL_PROVIDERS_FAILED
 *   marketing-reviewer:…:1:1:gemini     ALL_PROVIDERS_FAILED
 *   marketing-reviewer:…:1:1:cerebras   ALL_PROVIDERS_FAILED
 *   marketing-reviewer:…:1:1:mistral    SUCCEEDED
 *
 * Пять обращений из шести потрачены на провайдеров, про которых в базе уже
 * записано, что их ключи остывают. Бюджет B680 в 12 обращений на материал
 * выгорал за два раунда правки, и материал умирал от расхода, а не от того,
 * что с ним что-то не так.
 *
 * Отсюда и рост расхода после первой половины: раньше проход не начинался
 * вовсе (остывание B658 держало его 30 минут), теперь он начинается и честно
 * доходит до конца — но по дороге стучится в закрытые двери.
 *
 * Список доступных провайдеров уже вычисляется ДО автора (`pool-capacity`).
 * Тот же список должен задавать и очередь обхода.
 */

import { AIProvider } from "@prisma/client";
import { marketingProviderOrder } from "@/lib/marketing/model-pool";

const ALL = [
  AIProvider.OPENROUTER,
  AIProvider.GEMINI,
  AIProvider.CEREBRAS,
  AIProvider.GROQ,
  AIProvider.MISTRAL,
  AIProvider.COHERE,
];

describe("B699 · очередь обхода не стучится в остывающие ключи", () => {
  it("остывшие провайдеры в очередь не попадают", () => {
    const order = marketingProviderOrder("writer:seed", [], [AIProvider.MISTRAL, AIProvider.GEMINI]);
    expect(order).toEqual(expect.arrayContaining([AIProvider.MISTRAL, AIProvider.GEMINI]));
    expect(order).toHaveLength(2);
  });

  it("замер прода: живым остался один Mistral — очередь ровно из него", () => {
    expect(marketingProviderOrder("reviewer:seed", [], [AIProvider.MISTRAL]))
      .toEqual([AIProvider.MISTRAL]);
  });

  it("исключение автора сильнее доступности", () => {
    const order = marketingProviderOrder(
      "reviewer:seed",
      [AIProvider.GROQ],
      [AIProvider.GROQ, AIProvider.MISTRAL],
    );
    expect(order).toEqual([AIProvider.MISTRAL]);
  });

  /**
   * Пустой список доступных означает «мы не знаем», а не «никого нет»: чтение
   * состояния ключей — вспомогательное действие, и его отказ не должен молча
   * останавливать весь контур. В этом случае обход идёт по всему пулу, как до
   * правки.
   */
  it("пустой список доступных не обрезает очередь до нуля", () => {
    expect(marketingProviderOrder("writer:seed", [], [])).toHaveLength(ALL.length);
    expect(marketingProviderOrder("writer:seed", [])).toHaveLength(ALL.length);
  });

  it("провайдер вне активного списка не проникает через доступность", () => {
    expect(marketingProviderOrder("writer:seed", [], [AIProvider.OPENAI, AIProvider.MISTRAL]))
      .toEqual([AIProvider.MISTRAL]);
  });

  it("вращение первого выбора сохраняется внутри доступных", () => {
    const available = [AIProvider.GROQ, AIProvider.GEMINI, AIProvider.MISTRAL];
    const seeds = ["a", "b", "c", "d", "e", "f"].map(
      (seed) => marketingProviderOrder(seed, [], available)[0],
    );
    expect(new Set(seeds).size).toBeGreaterThan(1);
    for (const order of seeds) expect(available).toContain(order);
  });
});
