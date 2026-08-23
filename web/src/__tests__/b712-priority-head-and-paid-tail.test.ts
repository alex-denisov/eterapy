/**
 * B712 — приоритетная голова и платный хвост.
 *
 * Требование владельца 2026-08-16 дословно: «Можешь кстати добавить платный
 * провайдер Яндекса для написания материалов, а fallback сделать на OpenAI
 * провайдер для целей SMM/SEO. Я бы поставил в приоритете следующие
 * провайдеры: Gemini -> Yandex -> OpenAI».
 *
 * B719 — ТРЕБОВАНИЕ ЗАКРЫТО РЕШЕНИЕМ ВЛАДЕЛЬЦА 2026-08-23, ДОСЛОВНО: «Яндекс
 * стоит после бесплатного хвоста, суточный потолок расхода в рублях - 10р,
 * OpenAI разрешен как иностранный маршрут, поставь его перед Яндекс с суточным
 * лимитом в 0,03$». Три вопроса, блокировавшие тикет, отвечены; порядок
 * головы «Gemini → Yandex → OpenAI» от 16.08 этим отменён — Яндекс уехал из
 * головы в платный хвост и стоит там ВТОРЫМ.
 *
 * ⚠ ОДНА ИЗ ПРЕЖНИХ ПОСЫЛОК ОКАЗАЛАСЬ НЕВЕРНОЙ. Здесь стояло «ни одного
 * адаптера YandexGPT в коде». Адаптер есть — `web/src/lib/ai-gateway/
 * yandex-adapter.ts`, им платформа ходит в YandexGPT Pro в продукте, и имя
 * модели `yandexgpt/latest` не выдумано, а взято из `YANDEX_TEXT_MODELS`.
 * Не хватает ровно одного: credential'а YANDEX в боевой базе (сверено
 * 2026-08-23 — 16 строк, YANDEX среди них нет). Пока его нет, маршрут в обход
 * не попадает — это и сторожит прогон ниже.
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
    // B719: хвост из двух, и последним теперь Яндекс — OpenAI перед ним.
    expect(order.at(-1)).toBe(AIProvider.YANDEX);
    expect(order.at(-2)).toBe(AIProvider.OPENAI);
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

describe("B719 — платный хвост по решению владельца 2026-08-23", () => {
  it("в голове остался только Gemini: Яндекс уехал в хвост", () => {
    expect(MARKETING_PRIORITY_HEAD).toEqual([AIProvider.GEMINI]);
    expect(MARKETING_PRIORITY_HEAD as readonly AIProvider[]).not.toContain(AIProvider.YANDEX);
  });

  it("OpenAI стоит перед Яндексом, и оба — после всего бесплатного", () => {
    expect(MARKETING_PAID_PROVIDERS).toEqual([AIProvider.OPENAI, AIProvider.YANDEX]);
    const order = marketingProviderOrder("pub-1", [], [], { paidFallback: true });
    const free = order.filter((provider) =>
      provider !== AIProvider.OPENAI && provider !== AIProvider.YANDEX);
    const firstPaid = order.findIndex((provider) =>
      provider === AIProvider.OPENAI || provider === AIProvider.YANDEX);
    expect(firstPaid).toBe(free.length);
  });

  it("Яндекс в обход не попадает, пока в базе нет его ключа", () => {
    // `availableNow` — это список провайдеров с живым credential'ом. Яндекса
    // в нём нет на боевой базе, и хвост обязан это уважать.
    const available = [AIProvider.GEMINI, AIProvider.MISTRAL, AIProvider.OPENAI];
    const order = marketingProviderOrder("pub-1", [], available, { paidFallback: true });
    expect(order).not.toContain(AIProvider.YANDEX);
    expect(order.at(-1)).toBe(AIProvider.OPENAI);
  });

  it("появится ключ — маршрут включится сам, без правки кода", () => {
    const available = [AIProvider.GEMINI, AIProvider.OPENAI, AIProvider.YANDEX];
    const order = marketingProviderOrder("pub-1", [], available, { paidFallback: true });
    expect(order.slice(-2)).toEqual([AIProvider.OPENAI, AIProvider.YANDEX]);
  });
});
