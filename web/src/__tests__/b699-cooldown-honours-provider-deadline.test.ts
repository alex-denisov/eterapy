/**
 * B699 — исчерпанная квота доедала сама себя.
 *
 * Замер прода 2026-08-09, `ai_requests` за сутки, ровно по часам:
 *
 *   marketing-agent-writer   SUCCEEDED  88  (557 058 токенов)
 *   marketing-agent-reviewer SUCCEEDED  25
 *   marketing-agent-reviewer FAILED    139
 *   выпущено материалов                  0
 *
 * Каждый час автор успешно писал ПЯТЬ материалов и списывал за них токены.
 * Редактор падал на исчерпанной квоте, успешный текст автора выбрасывался
 * целиком, через час ту же строку писали заново. Квоты не восстанавливались,
 * потому что их доедала попытка обойти их же нехватку. Telegram и VK молчали с
 * 06.08.
 *
 * Ровность «пять в час» — это подпись плоского срока остывания. HTTP 429 давал
 * всем ключам одни и те же 5 минут, тогда как провайдер в теле отказа называл
 * СВОЙ срок:
 *
 *   Groq   «Please try again in 58m35.183999999s» — суточный лимит токенов
 *   Gemini «Please retry in 49.593789631s»        — минутная квота
 *   Cohere «limited to 1000 API calls / month»    — месячный триал
 *
 * Разброс от 50 секунд до месяца укладывался в одно число. Ключ, исчерпанный на
 * сутки, возвращался на пробу через 5 минут — и снова жёг автора.
 *
 * Сам срок до классификатора не доходил вовсе: в попытке был `code`, но не было
 * текста ответа.
 */

import {
  classifyCredentialFailure,
  retryDelayFromProviderMessage,
  MAX_CREDENTIAL_COOLDOWN_MS,
} from "@/lib/ai-gateway/cooldown";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("B699 · срок остывания берётся у провайдера", () => {
  describe("разбор срока из ответа провайдера", () => {
    it("читает составной срок Groq «58m35.183999999s»", () => {
      const delay = retryDelayFromProviderMessage(
        "429 Rate limit reached for model `qwen/qwen3.6-27b` in organization `org_01k` "
        + "service tier `on_demand` on tokens per day (TPD): Limit 200000, Used 199995, "
        + "Requested 8142. Please try again in 58m35.183999999s. Need more tokens?",
      );
      expect(delay).toBeCloseTo(58 * MINUTE + 35_184, -2);
    });

    it("читает дробные секунды Gemini «49.593789631s»", () => {
      const delay = retryDelayFromProviderMessage(
        "You exceeded your current quota, please check your plan and billing details. "
        + "Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, "
        + "limit: 20, model: gemini-3.6-flash\nPlease retry in 49.593789631s.",
      );
      expect(delay).toBeCloseTo(49_594, -2);
    });

    it("читает часы и минуты без секунд", () => {
      expect(retryDelayFromProviderMessage("Please try again in 2h30m")).toBe(2 * HOUR + 30 * MINUTE);
    });

    it("месячный триал Cohere — это не пять минут, а верхний предел", () => {
      const delay = retryDelayFromProviderMessage(
        "You are using a Trial key, which is limited to 1000 API calls / month. "
        + "You can continue to use the Trial key for free or upgrade to a Production key",
      );
      expect(delay).toBe(MAX_CREDENTIAL_COOLDOWN_MS);
    });

    it("суточный лимит без названного срока ждёт до конца суток, а не 5 минут", () => {
      const delay = retryDelayFromProviderMessage("Quota exceeded: requests per day limit reached");
      expect(delay).toBe(MAX_CREDENTIAL_COOLDOWN_MS);
    });

    it("молчание провайдера остаётся молчанием", () => {
      expect(retryDelayFromProviderMessage(undefined)).toBeNull();
      expect(retryDelayFromProviderMessage("429 Provider returned error")).toBeNull();
    });

    it("не принимает срок длиннее суточного предела", () => {
      const delay = retryDelayFromProviderMessage("Please try again in 720h");
      expect(delay).toBe(MAX_CREDENTIAL_COOLDOWN_MS);
    });

    /**
     * Текст отказа приходит от внешней стороны. Разбор обязан быть разбором, а
     * не исполнением: никаких срочных «сбрось остывание» из чужой строки.
     */
    it("не даёт чужому тексту обнулить остывание", () => {
      expect(retryDelayFromProviderMessage("Please try again in 0s")).toBeNull();
      expect(retryDelayFromProviderMessage("Please try again in -5m")).toBeNull();
    });
  });

  describe("классификация ключа", () => {
    it("429 без подсказки провайдера остаётся на прежних пяти минутах", () => {
      expect(classifyCredentialFailure("HTTP_429")).toEqual({
        cooldownMs: 5 * MINUTE,
        regionBlocked: false,
      });
    });

    it("429 с названным сроком Groq остывает почти час, а не пять минут", () => {
      const { cooldownMs } = classifyCredentialFailure("HTTP_429", {
        providerMessage: "Rate limit reached … Please try again in 58m35.183999999s.",
      });
      expect(cooldownMs).toBeGreaterThan(58 * MINUTE);
      expect(cooldownMs).toBeLessThan(HOUR);
    });

    it("429 с коротким сроком Gemini не растягивается до пяти минут", () => {
      const { cooldownMs } = classifyCredentialFailure("HTTP_429", {
        providerMessage: "Quota exceeded … Please retry in 49.593789631s.",
      });
      expect(cooldownMs).toBeCloseTo(49_594, -2);
    });

    it("месячный триал Cohere выбывает на сутки", () => {
      const { cooldownMs } = classifyCredentialFailure("HTTP_429", {
        providerMessage: "You are using a Trial key, which is limited to 1000 API calls / month.",
      });
      expect(cooldownMs).toBe(MAX_CREDENTIAL_COOLDOWN_MS);
    });

    /**
     * Региональная блокировка — свойство маршрута, а не квоты. Подсказка из тела
     * ответа её срок не сокращает: иначе один 403 с бодрым «retry in 1s» вернул
     * бы ключ в пул мгновенно и снова получил бы 403 (B694).
     */
    it("403 держит свои сутки и признак блокировки, что бы ни писал провайдер", () => {
      expect(classifyCredentialFailure("HTTP_403", { providerMessage: "Please retry in 1s" })).toEqual({
        cooldownMs: 24 * HOUR,
        regionBlocked: true,
      });
    });

    it("402 у Cerebras — квота аккаунта, срок прежний", () => {
      expect(classifyCredentialFailure("HTTP_402").cooldownMs).toBe(HOUR);
    });

    it("отсутствующая настройка по-прежнему не остывает", () => {
      expect(classifyCredentialFailure("MISSING_CONFIG").cooldownMs).toBe(0);
    });
  });
});
