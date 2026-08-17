/**
 * B712 — приоритетная голова и платный хвост.
 *
 * Требование владельца 2026-08-16 дословно: «Можешь кстати добавить платный
 * провайдер Яндекса для написания материалов, а fallback сделать на OpenAI
 * провайдер для целей SMM/SEO. Я бы поставил в приоритете следующие
 * провайдеры: Gemini -> Yandex -> OpenAI».
 *
 * ⚠ ЯНДЕКСА В СИСТЕМЕ НЕТ. Проверено на боевой базе 2026-08-17: ноль записей в
 * `ai_provider_credentials` (там 16 провайдеров, YANDEX не среди них), ноль
 * моделей в `ai_provider_models`, и ни одного адаптера YandexGPT в коде —
 * строка `YANDEX` встречается только в SpeechKit, S3 и Вебмастере, это другие
 * сервисы. Выдумать имя модели нельзя: это 404 в бою (B703).
 *
 * Поэтому здесь строится МЕХАНИЗМ, а Яндекс занимает в нём объявленное место и
 * включится сам, когда появится ключ. Прогон сторожит именно это: место
 * объявлено, но пустой провайдер в обход не попадает.
 *
 * ⚠ ЧТО ДЕРЖИТ ВРАЩЕНИЕ. Бесплатный хвост обязан продолжать вращаться: у
 * тринадцати провайдеров квоты независимые, и постоянная голова выжигала бы
 * одну, не трогая остальные (B703). Приоритет меняет ГОЛОВУ и ХВОСТ, а не
 * середину.
 */

import { AIProvider } from "@prisma/client";
import {
  MARKETING_PAID_PROVIDERS,
  MARKETING_PRIORITY_HEAD,
  marketingProviderOrder,
} from "@/lib/marketing/model-pool";

describe("B712 — порядок провайдеров", () => {
  it("Gemini стоит первым независимо от материала", () => {
    for (const seed of ["pub-1", "pub-2", "pub-3", "pub-999"]) {
      expect(marketingProviderOrder(seed)[0]).toBe(AIProvider.GEMINI);
    }
  });

  it("бесплатный хвост продолжает вращаться между материалами", () => {
    const tails = ["a", "b", "c", "d", "e", "f"].map((seed) =>
      marketingProviderOrder(seed).slice(1, 4).join(","));
    // Вращение живо, если хотя бы два материала получили разный хвост.
    expect(new Set(tails).size).toBeGreaterThan(1);
  });

  it("платный провайдер стоит последним, а не вторым", () => {
    const order = marketingProviderOrder("pub-1", [], [], { paidFallback: true });
    expect(order.at(-1)).toBe(AIProvider.OPENAI);
  });

  it("без явного разрешения платный провайдер не появляется вовсе", () => {
    expect(marketingProviderOrder("pub-1")).not.toContain(AIProvider.OPENAI);
    expect(marketingProviderOrder("pub-1", [], [], { paidFallback: false }))
      .not.toContain(AIProvider.OPENAI);
  });

  it("исключённый провайдер не возвращается ни головой, ни хвостом", () => {
    const order = marketingProviderOrder("pub-1", [AIProvider.GEMINI], [], { paidFallback: true });
    expect(order).not.toContain(AIProvider.GEMINI);
    expect(order[0]).not.toBe(AIProvider.GEMINI);
  });

  it("голова уступает, когда её провайдер остывает", () => {
    const available = [AIProvider.GROQ, AIProvider.NVIDIA, AIProvider.MISTRAL];
    const order = marketingProviderOrder("pub-1", [], available);
    expect(order).not.toContain(AIProvider.GEMINI);
    expect(order.length).toBe(3);
  });
});

describe("B712 — место Яндекса объявлено, но пустым не занимается", () => {
  it("Яндекс назван в приоритете вслух", () => {
    expect(MARKETING_PRIORITY_HEAD).toContain(AIProvider.YANDEX);
    expect(MARKETING_PRIORITY_HEAD.indexOf(AIProvider.GEMINI))
      .toBeLessThan(MARKETING_PRIORITY_HEAD.indexOf(AIProvider.YANDEX));
  });

  it("но в обход не попадает, пока не подключён", () => {
    const order = marketingProviderOrder("pub-1", [], [], { paidFallback: true });
    expect(order).not.toContain(AIProvider.YANDEX);
  });

  it("платный список назван явно и Яндекс в нём перед OpenAI", () => {
    expect(MARKETING_PAID_PROVIDERS).toEqual([AIProvider.YANDEX, AIProvider.OPENAI]);
  });
});
