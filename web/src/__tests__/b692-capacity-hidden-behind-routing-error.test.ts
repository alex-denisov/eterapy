/**
 * B692 — исчерпанная квота пряталась за «все провайдеры отказали».
 *
 * Замер прода 2026-08-06, сразу после починки B687. Материал
 * `b620-rss-dzen-01` («как пережить расставание») получил статус **FAILED** —
 * то есть «материал негоден». В журнале при этом видно совсем другое:
 *
 *   OPENROUTER  HTTP_429  429 Provider returned error
 *   GEMINI      HTTP_429  Quota exceeded … generate_content_free_tier_requests
 *   GROQ        HTTP_429  Rate limit reached … tokens per day (TPD): Limit 200000
 *   CEREBRAS    HTTP_402  квота аккаунта
 *   COHERE      HTTP_429  Trial key, 1000 API calls / month
 *   MISTRAL     жив, но это модель автора
 *
 * Каждый отказ — про ёмкость, и через час всё это проходит само. Но роль
 * получала не код провайдера, а обёртку `AIGatewayRoutingError` с текстом
 * «All AI providers failed for marketing-agent-reviewer». Ни одного маркера
 * ёмкости («429», «rate limit», «quota») в этом тексте нет, поэтому
 * `isCapacityError` отвечал `false`, отказ считался браком материала, и хороший
 * текст сгорал навсегда — при том что правило владельца прямо обратное:
 * `feedback_pause_channel_not_cancel_material`.
 *
 * Раньше это не проявлялось, потому что до B687 план всегда достраивался всеми
 * провайдерами и до обёртки дело доходило редко. Ограничение маршрута сделало
 * обёртку обычным исходом — и обнажило потерю кода.
 *
 * Границу держим: обёртка вокруг НЕёмкостных отказов ёмкостью не считается,
 * иначе брак материала будет вечно ждать «следующего прохода».
 */

import { AIGatewayRoutingError } from "@/lib/ai-gateway/routing";
import { isCapacityError, isDeferrableError } from "@/lib/marketing/agent";

function routingError(codes: string[]) {
  return new AIGatewayRoutingError(
    "All AI providers failed for marketing-agent-reviewer",
    "ALL_PROVIDERS_FAILED",
    codes.map((code) => ({
      provider: "GROQ" as never,
      status: "failed" as const,
      code,
      retryable: true,
    })),
  );
}

describe("B692 · код провайдера доживает до классификации", () => {
  it("429 за обёрткой — это ёмкость, а не брак материала", () => {
    expect(isCapacityError(routingError(["HTTP_429"]))).toBe(true);
    expect(isDeferrableError(routingError(["HTTP_429"]))).toBe(true);
  });

  it("402 по квоте аккаунта — тоже ёмкость", () => {
    expect(isCapacityError(routingError(["HTTP_402"]))).toBe(true);
  });

  it("смесь ёмкостных отказов остаётся ёмкостью", () => {
    expect(isCapacityError(routingError(["HTTP_429", "HTTP_402", "HTTP_429"]))).toBe(true);
  });

  it("не ёмкостная обёртка ёмкостью не становится", () => {
    expect(isCapacityError(routingError(["HTTP_400"]))).toBe(false);
    expect(isCapacityError(routingError(["MISSING_CONFIG"]))).toBe(false);
  });

  it("хотя бы один не-ёмкостный отказ снимает поблажку", () => {
    // Иначе настоящий брак маршрута вечно ждал бы «следующего прохода».
    expect(isCapacityError(routingError(["HTTP_429", "HTTP_400"]))).toBe(false);
  });

  it("обёртка без подробностей ёмкостью не считается", () => {
    expect(isCapacityError(routingError([]))).toBe(false);
  });
});
