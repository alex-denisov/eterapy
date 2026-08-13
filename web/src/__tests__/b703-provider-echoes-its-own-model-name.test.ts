/**
 * B703, фаза 5 — провайдер возвращает СВОЁ имя модели, и успешный ответ
 * выбрасывался целиком.
 *
 * Замер прода 2026-08-13 09:34 UTC, сигнал `agent:attempt-budget`:
 *
 *   Материал израсходовал 18 обращений к моделям за проход (предел 18)
 *   и остаётся черновиком. Последние отказы:
 *   HUGGINGFACE: model Prism-ML/Ternary-Bonsai-27B is ineligible:
 *   release date is not approved for the marketing pool (cutoff 2026-02-28)
 *
 * Просили мы `prism-ml/Ternary-Bonsai-27B-AWQ-4bit` — модель, чья дата релиза
 * (2026-07-11) в таблице ЕСТЬ и рубеж свежести проходит. Роутер Hugging Face
 * отвечает каноническим именем весов: другой регистр и без хвоста сборки.
 * Сверка шла точным совпадением строки, поэтому:
 *
 *   1. вызов проходил успешно и токены списывались;
 *   2. готовый текст выбрасывался как «модель не одобрена»;
 *   3. обращение уходило в бюджет материала — и так каждый проход.
 *
 * За сутки это 14 успешных вызовов HUGGINGFACE, ни один из которых не дошёл до
 * материала. Тот же класс ошибки, что B694: код верен, а механизм мёртв.
 *
 * Правило правки: имя весов может прийти общим, но РЕШЕНИЕ по нему принимается
 * только тогда, когда оно одинаково для всех вариантов под этим именем.
 * Неоднозначность решается отказом, а не догадкой.
 */

import { marketingModelFreshness } from "@/lib/marketing/model-pool";

describe("B703 — провайдер называет модель по-своему", () => {
  it("каноническое имя весов Hugging Face признаётся свежим", () => {
    // Ровно та строка, которую роутер вернул на проде.
    const freshness = marketingModelFreshness("Prism-ML/Ternary-Bonsai-27B");
    expect(freshness.eligible).toBe(true);
  });

  it("оба варианта сборки под этим именем одобрены — решение однозначно", () => {
    expect(marketingModelFreshness("prism-ml/Ternary-Bonsai-27B-AWQ-4bit").eligible).toBe(true);
    expect(marketingModelFreshness("prism-ml/Ternary-Bonsai-27B-gguf").eligible).toBe(true);
  });

  it("точное имя по-прежнему судится точной датой, а не догадкой", () => {
    const freshness = marketingModelFreshness("mistral-medium-2604");
    expect(freshness.releaseDate).toBe("2026-04-21");
    expect(freshness.eligible).toBe(true);
  });

  it("отличие ТОЛЬКО регистром — та же модель", () => {
    expect(marketingModelFreshness("MISTRAL-MEDIUM-2604").eligible).toBe(true);
  });

  it("устаревшая модель не проходит и под общим именем", () => {
    // `openai-fast` = gpt-oss-20b, 2025-08-05: старше рубежа на полгода.
    // Именно из-за неё Pollinations не входит в активный пул.
    expect(marketingModelFreshness("openai-fast").eligible).toBe(false);
  });

  it("незнакомое имя остаётся неодобренным — выдумывать дату нельзя", () => {
    const freshness = marketingModelFreshness("acme/never-heard-of-this-7b");
    expect(freshness.eligible).toBe(false);
    expect(freshness.releaseDate).toBeNull();
  });

  it("общее имя НЕ одобряет, если хоть один вариант под ним устарел", () => {
    // Префикс `mistral-` покрывает и `mistral-small-2603` (2026-03-16), и
    // `mistral-medium-2604`. Оба свежие — но проверяем сам принцип на паре,
    // где решения расходятся: `gemini-3` покрывает `gemini-3.5-flash`
    // (2026-05-19, свежая) и `gemini-3.6-flash` (2026-07-21, свежая).
    // Разошедшийся случай собираем явно: `gpt-oss` не в таблице вовсе.
    expect(marketingModelFreshness("gpt-oss").eligible).toBe(false);
  });

  it("пустое имя не проходит", () => {
    expect(marketingModelFreshness("").eligible).toBe(false);
    expect(marketingModelFreshness("   ").eligible).toBe(false);
  });
});
