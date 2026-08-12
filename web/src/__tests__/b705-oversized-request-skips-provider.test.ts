/**
 * B705 — слишком большой запрос не обходит все ключи провайдера по кругу.
 *
 * Замер прода 2026-08-12 (двое суток): автор сделал ~1200 обращений, из них
 * **594 ушли в GROQ и все до одного вернули HTTP 413** при 13 успехах. 413 —
 * это размер НАШЕГО запроса, а не квота провайдера
 * (`reference_http_413_is_request_size_not_quota`), и от смены ключа он не
 * меняется: одно и то же тело получает один и тот же отказ столько раз, сколько
 * у провайдера заведено ключей.
 *
 * Граница проходит по числам в ответе: «Limit 6000, Requested 13000» — свойство
 * запроса; те же 413 без чисел или с `requested <= limit` — занятая минута, и
 * там следующий ключ действительно может ответить.
 */

import { decideFailureFallback } from "@/lib/ai-gateway/routing";

const GROQ_OVERSIZED = "Request too large for model `llama-3.3-70b-versatile` on tokens per minute (TPM): "
  + "Limit 6000, Requested 13000, please reduce your message size and try again.";

describe("B705 — 413 по размеру запроса уводит к следующему провайдеру", () => {
  it("перебор ключей прекращается, когда провайдер назвал числа", () => {
    expect(decideFailureFallback("HTTP_413", { providerMessage: GROQ_OVERSIZED })).toBe("skipProvider");
  });

  it("413 без доказательства размера остаётся поводом попробовать другой ключ", () => {
    expect(decideFailureFallback("HTTP_413")).toBe("retryNextCredential");
    expect(decideFailureFallback("HTTP_413", { providerMessage: "Payload too large" }))
      .toBe("retryNextCredential");
  });

  it("запрос, уложившийся в потолок, — это занятая минута, а не размер", () => {
    const contention = "Rate limit reached on tokens per minute (TPM): Limit 6000, Requested 5200, "
      + "please try again in 12.4s";
    expect(decideFailureFallback("HTTP_413", { providerMessage: contention }))
      .toBe("retryNextCredential");
  });

  it("остальные коды решают по-прежнему", () => {
    expect(decideFailureFallback("HTTP_403", { providerMessage: GROQ_OVERSIZED })).toBe("skipProvider");
    expect(decideFailureFallback("HTTP_429", { providerMessage: "try again in 30s" }))
      .toBe("retryNextCredential");
    expect(decideFailureFallback(undefined)).toBe("retryNextCredential");
  });
});
