/**
 * B713 §7 — сильная модель достаётся тому, кто пишет.
 *
 * ЗАМЕР ПРОДА 14.08 12:00 → 17.08 12:00 UTC (`ai_attempts` × `ai_requests`,
 * `feature like 'marketing%'`), успех/отказ:
 *
 *   nvidia/nemotron-3-super-120b-a12b:free   89 / 0   — стоял на РЕДАКТОРЕ
 *   mistral-medium-2604                      41 / 0   — стоял на РЕДАКТОРЕ
 *   nemotron-3-ultra-free                    27 / 2   — стоял на РЕДАКТОРЕ
 *   nvidia/nemotron-3-ultra-550b-a55b:free   18 / 1   — стоял на РЕДАКТОРЕ
 *   Prism-ML/Ternary-Bonsai-27B              26 / 0   — стоял на РЕДАКТОРЕ
 *
 *   google/gemma-4-31b-it:free                0 / 1   — стоял на ПИСАТЕЛЕ
 *   deepseek-v4-flash-free                    0 / 4   — стоял на ПИСАТЕЛЕ
 *   prism-ml/Ternary-Bonsai-27B-gguf          0 / 4   — стоял на РЕДАКТОРЕ
 *   nvidia/nemotron-3.5-lightning-30b-a3b    32 / 0   — стоял на РЕДАКТОРЕ
 *   nvidia/nemotron-3-super-120b-a12b        13 / 1   — стоял на ПИСАТЕЛЕ
 *
 * Флагманы пула стояли на редакторе, который только выносит суждение, а
 * писатель — от которого зависит текст — работал на самых слабых и наименее
 * надёжных моделях. У ТРЁХ провайдеров модель писателя была мертва при живой
 * модели редактора: каждое обращение писателя туда — гарантированно
 * потраченная попытка из бюджета материала.
 *
 * Требование владельца 2026-08-17 дословно: «Вероятно писателю нужно выдать
 * более сильную модель LLM и правильный системный промт».
 *
 * ⚠ ЧЕГО ЭТОТ ПРОГОН НЕ ДЕЛАЕТ. Он не измеряет качество моделей — измерить его
 * может только прод. Он держит РЕШЕНИЕ, принятое по замеру, чтобы обратная
 * перестановка не проехала молча, и держит инвариант B699: две роли одного
 * провайдера либо смотрят в разные модели, либо провайдер честно объявлен
 * одномодельным.
 */

import { AIProvider } from "@prisma/client";
import {
  MARKETING_ACTIVE_PROVIDERS,
  MARKETING_REVIEWER_MODEL_PREFERENCES,
  MARKETING_WRITER_MODEL_PREFERENCES,
  marketingModelFreshness,
  marketingProvidersWithSingleModel,
} from "@/lib/marketing/model-pool";

/** Модели, доказавшие живость боевым ключом за 72 часа. Достаются писателю. */
const PROVEN_WRITER_MODEL: Partial<Record<AIProvider, string>> = {
  [AIProvider.OPENROUTER]: "nvidia/nemotron-3-super-120b-a12b:free",
  [AIProvider.MISTRAL]: "mistral-medium-2604",
  [AIProvider.OPENCODE_ZEN]: "nemotron-3-ultra-free",
  [AIProvider.KILOCODE]: "nvidia/nemotron-3-ultra-550b-a55b:free",
  [AIProvider.NVIDIA]: "nvidia/nemotron-3-super-120b-a12b",
};

/** Модели, у которых за 72 часа НОЛЬ успехов. Писателю не достаются никогда. */
const DEAD_IN_PRODUCTION = [
  "google/gemma-4-31b-it:free",
  "deepseek-v4-flash-free",
  "prism-ml/Ternary-Bonsai-27B-gguf",
];

describe("B713 — писатель получает сильнейшую живую модель провайдера", () => {
  it.each(Object.entries(PROVEN_WRITER_MODEL))(
    "%s отдаёт писателю модель, доказавшую живость на проде",
    (provider, expected) => {
      expect(MARKETING_WRITER_MODEL_PREFERENCES[provider as AIProvider]).toBe(expected);
    },
  );

  it("не оставляет писателю ни одной модели с нулём успехов за замер", () => {
    const assigned = Object.values(MARKETING_WRITER_MODEL_PREFERENCES)
      .map((model) => model.toLowerCase());
    for (const dead of DEAD_IN_PRODUCTION) {
      expect(assigned).not.toContain(dead.toLowerCase());
    }
  });

  it("держит инвариант B699: роли различимы либо провайдер объявлен одномодельным", () => {
    const single = new Set(marketingProvidersWithSingleModel());
    for (const provider of MARKETING_ACTIVE_PROVIDERS) {
      const writer = MARKETING_WRITER_MODEL_PREFERENCES[provider];
      const reviewer = MARKETING_REVIEWER_MODEL_PREFERENCES[provider];
      if (!writer || !reviewer) continue;
      if (writer === reviewer) {
        expect(single.has(provider)).toBe(true);
      } else {
        expect(single.has(provider)).toBe(false);
      }
    }
  });

  it("не называет ни одной модели, которой нет в таблице свежести", () => {
    /**
     * B719 — вопрос задаётся тому, кому он адресован.
     *
     * Рубеж свежести существует, чтобы БЕСПЛАТНЫЙ тариф не подсунул старые
     * веса под новым именем. К платному хвосту он неприменим: маршрут выбран
     * владельцем поимённо, а `yandexgpt/latest` — скользящий псевдоним, у
     * которого даты выпуска нет и быть не может. Ограничивают его деньги
     * (`paid-route-budget.ts`), а не возраст весов.
     */
    const named = [AIProvider.OPENROUTER, AIProvider.GEMINI, AIProvider.GROQ,
      AIProvider.MISTRAL, AIProvider.KILOCODE, AIProvider.NVIDIA,
      AIProvider.OPENCODE_ZEN, AIProvider.SAMBANOVA, AIProvider.HUGGINGFACE]
      .flatMap((provider) => [
        MARKETING_WRITER_MODEL_PREFERENCES[provider],
        MARKETING_REVIEWER_MODEL_PREFERENCES[provider],
      ])
      .filter((model): model is string => Boolean(model));
    expect(named.length).toBeGreaterThan(10);
    for (const model of named) {
      expect(marketingModelFreshness(model).eligible).toBe(true);
    }
  });
});
