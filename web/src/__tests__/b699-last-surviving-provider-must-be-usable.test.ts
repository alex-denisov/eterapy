/**
 * B699 — единственный выживший провайдер был бесполезен по построению.
 *
 * Редактору нужна модель, ОТЛИЧНАЯ от модели автора: это и есть смысл
 * независимой проверки. Но у Mistral обе роли указывали на одну и ту же
 * `mistral-small-2603`, поэтому в день, когда все остальные исчерпали квоты,
 * пул отвечал:
 *
 *   В пуле не осталось модели, отличной от модели автора
 *   (GROQ: All AI providers failed …; … MISTRAL: resolved to the writer's model
 *   mistral-small-2603)
 *
 * Живой провайдер был, ёмкость у него была, а материал не выходил.
 *
 * Второе: цена этого отказа платилась ПОСЛЕ вызова автора. Замер прода
 * 2026-08-09 — 88 успешных генераций автора за сутки и ноль публикаций: текст
 * писался, токены списывались, и только потом выяснялось, что проверить его
 * некому. Вопрос «есть ли вообще вторая модель» обязан решаться до автора.
 *
 * Разводить роли умеет ПУЛ, а не каждый провайдер по отдельности. Требовать по
 * две модели от каждого нельзя: каталог `ai_provider_models` на проде снят
 * 2026-05-28 и второй пригодной по свежести модели для Groq, Cerebras и Cohere
 * в нём просто нет, а выдумывать имена моделей — это 404 в бою. Поэтому
 * инвариант ниже — свойство пула.
 */

import { AIProvider } from "@prisma/client";
import {
  MARKETING_ACTIVE_PROVIDERS,
  MARKETING_WRITER_MODEL_PREFERENCES,
  MARKETING_REVIEWER_MODEL_PREFERENCES,
  marketingModelFreshness,
  marketingPoolCanSeparateRoles,
  marketingProvidersWithSingleModel,
} from "@/lib/marketing/model-pool";

describe("B699 · выживший в одиночку Mistral снова годен", () => {
  it("редактор Mistral — не та же модель, что автор", () => {
    expect(MARKETING_REVIEWER_MODEL_PREFERENCES[AIProvider.MISTRAL])
      .not.toBe(MARKETING_WRITER_MODEL_PREFERENCES[AIProvider.MISTRAL]);
  });

  it("обе модели Mistral допущены по свежести", () => {
    for (const model of [
      MARKETING_WRITER_MODEL_PREFERENCES[AIProvider.MISTRAL]!,
      MARKETING_REVIEWER_MODEL_PREFERENCES[AIProvider.MISTRAL]!,
    ]) {
      expect(marketingModelFreshness(model)).toMatchObject({ eligible: true });
    }
  });

  it.each(MARKETING_ACTIVE_PROVIDERS)("обе модели %s допущены по свежести", (provider) => {
    for (const model of [
      MARKETING_WRITER_MODEL_PREFERENCES[provider]!,
      MARKETING_REVIEWER_MODEL_PREFERENCES[provider]!,
    ]) {
      expect(marketingModelFreshness(model)).toMatchObject({ eligible: true });
    }
  });

  /**
   * Список одномодельных провайдеров держим явно и под тестом: он прямо
   * означает «в одиночку этот провайдер конвейер не тянет». Когда у них
   * появится вторая пригодная модель, список сократится осознанно, а не молча.
   */
  it("одномодельные провайдеры перечислены явно", () => {
    // B703 — список пополнили SambaNova и TokenRouter: у обоих на бесплатном
    // тарифе ОДНА модель, вторая отвечает 402/403 при нулевом балансе.
    //
    // B713 — список пополнили ещё трое, и по той же причине, только выявленной
    // замером, а не пробой: у OpenRouter (`gemma-4-31b-it:free`), OpenCode Zen
    // (`deepseek-v4-flash-free`) и Hugging Face (сборка `-gguf`) вторая модель
    // за 72 часа боевой работы дала НОЛЬ успехов. Числиться двумодельным на
    // мёртвой модели дороже, чем честно объявить одну: конвейер иначе отправляет
    // половину обращений в стену и списывает их из бюджета материала.
    // B719 — из списка ушли Cerebras, Cohere и TokenRouter: не потому что у
    // них появилась вторая модель, а потому что они выведены из активного
    // пула целиком (0 успехов за всю сохранённую историю обращений).
    expect(marketingProvidersWithSingleModel()).toEqual([
      AIProvider.OPENROUTER,
      AIProvider.GROQ,
      AIProvider.OPENCODE_ZEN,
      AIProvider.SAMBANOVA,
      AIProvider.HUGGINGFACE,
    ]);
  });
});

describe("B699 · роли разводятся до вызова автора, а не после", () => {
  it("Mistral в одиночку роли разводит", () => {
    expect(marketingPoolCanSeparateRoles([AIProvider.MISTRAL])).toBe(true);
  });

  it("Groq в одиночку роли не разводит — и это выясняется без вызова автора", () => {
    expect(marketingPoolCanSeparateRoles([AIProvider.GROQ])).toBe(false);
  });

  it("пустой пул развести роли не может", () => {
    expect(marketingPoolCanSeparateRoles([])).toBe(false);
  });

  /**
   * Провайдер вне активного списка (платный OpenAI) ёмкостью не считается:
   * запрет владельца от 2026-08-09 на платные модели в контент-плане.
   */
  it("провайдер вне активного списка ёмкостью не считается", () => {
    expect(marketingPoolCanSeparateRoles([AIProvider.OPENAI])).toBe(false);
    expect(marketingPoolCanSeparateRoles([AIProvider.OPENAI, AIProvider.GROQ])).toBe(false);
  });

  it("два разных провайдера роли разводят", () => {
    expect(marketingPoolCanSeparateRoles([AIProvider.GROQ, AIProvider.GEMINI])).toBe(true);
  });

  it("одномодельный провайдер вместе с любым другим роли разводит", () => {
    // B719: Cerebras выведен из активного пула, поэтому пара берётся из живых
    // одномодельных — суть проверки та же.
    expect(marketingPoolCanSeparateRoles([AIProvider.GROQ, AIProvider.SAMBANOVA])).toBe(true);
  });
});
