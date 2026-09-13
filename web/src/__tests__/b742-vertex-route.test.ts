/**
 * B742 §7 — маршрут Vertex AI: те же модели, другой кошелёк.
 *
 * Владелец 2026-09-12: «Я точно не хочу ничего добавлять из своего кошелька,
 * но хочу использовать бонусы, хоть какие-то (желательно вообще все)».
 *
 * Ответ на это — не настройка качества, а смена двери. Бонусные $300 пробного
 * периода Google Cloud на Gemini API в AI Studio не распространяются (Google
 * вынес продукт из покрытия отдельным пунктом) и покрывают Vertex AI, где
 * живут ТЕ ЖЕ первые модели Gemini. Прогон сторожит то, из-за чего такой
 * перевод обычно и ломается: адрес, авторизацию и границу «что считать ключом
 * Vertex».
 */

import { generateKeyPairSync } from "node:crypto";
import {
  parseServiceAccount,
  resetServiceAccountTokenCache,
  serviceAccountAccessToken,
  signServiceAccountJwt,
} from "@/lib/ai-gateway/google-service-account";
import {
  createVertexAdapter,
  credentialUsesVertex,
  vertexLocationSupports,
  vertexModelUrl,
} from "@/lib/ai-gateway/vertex-adapter";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

function serviceAccountJson(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "service_account",
    project_id: "eterapy-prod",
    client_email: "vertex@eterapy-prod.iam.gserviceaccount.com",
    private_key: privateKey,
    ...over,
  });
}

beforeEach(() => resetServiceAccountTokenCache());

describe("B742 — что считается ключом Vertex", () => {
  it("обычный ключ AI Studio ключом Vertex не признаётся", () => {
    // Граница важнее удобства: признай мы ключ AI Studio за сервисный аккаунт —
    // голова пула ушла бы на маршрут, где её не примут, и отбивалась бы 401 на
    // каждом материале.
    expect(credentialUsesVertex("AIzaSyD-нечто-похожее-на-ключ")).toBe(false);
    expect(credentialUsesVertex("")).toBe(false);
    expect(credentialUsesVertex(null)).toBe(false);
  });

  it("сервисный аккаунт разбирается и как JSON, и как base64", () => {
    const json = serviceAccountJson();
    const direct = parseServiceAccount(json);
    const encoded = parseServiceAccount(Buffer.from(json).toString("base64"));
    expect(direct?.projectId).toBe("eterapy-prod");
    // Секреты доезжают на прод построчно, а JSON многострочный: base64 —
    // рекомендованный вид, и он обязан читаться так же.
    expect(encoded).toEqual(direct);
  });

  it("частично заполненный аккаунт не поднимается вовсе", () => {
    // 401 в бою и час разбирательств против честного «маршрут не настроен».
    expect(parseServiceAccount(serviceAccountJson({ project_id: "" }))).toBeNull();
    expect(parseServiceAccount(serviceAccountJson({ client_email: "" }))).toBeNull();
    expect(parseServiceAccount(serviceAccountJson({ private_key: "не ключ" }))).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ type: "authorized_user" }))).toBeNull();
  });

  it("перевод строки в закрытом ключе восстанавливается", () => {
    const escaped = serviceAccountJson({ private_key: privateKey.replace(/\n/g, "\\n") });
    expect(parseServiceAccount(escaped)?.privateKey).toBe(privateKey);
  });
});

describe("B742 — подпись и обмен на токен", () => {
  it("JWT подписывается закрытым ключом аккаунта и адресован Google", () => {
    const account = parseServiceAccount(serviceAccountJson())!;
    const jwt = signServiceAccountJwt(account, Date.UTC(2026, 8, 13, 6, 0, 0));
    const [header, payload, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    expect(claims.iss).toBe("vertex@eterapy-prod.iam.gserviceaccount.com");
    expect(claims.aud).toBe("https://oauth2.googleapis.com/token");
    expect(claims.scope).toBe("https://www.googleapis.com/auth/cloud-platform");
    expect(claims.exp - claims.iat).toBe(3600);
    expect(signature.length).toBeGreaterThan(300);
  });

  it("токен берётся один раз и живёт до срока", async () => {
    const account = parseServiceAccount(serviceAccountJson())!;
    const fetchImpl = jest.fn(async () => new Response(
      JSON.stringify({ access_token: "ya29.token", expires_in: 3600 }),
      { status: 200 },
    )) as unknown as typeof fetch;
    const now = Date.now();
    expect(await serviceAccountAccessToken({ account, fetchImpl, now })).toBe("ya29.token");
    await serviceAccountAccessToken({ account, fetchImpl, now: now + 60_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Запас перед истечением: попасть в отказ ровно на границе — самый
    // неприятный вид отказа, он выглядит случайным.
    await serviceAccountAccessToken({ account, fetchImpl, now: now + 3_400_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("тело ответа при отказе наружу не уходит: в нём эхо подписи", async () => {
    const account = parseServiceAccount(serviceAccountJson())!;
    const fetchImpl = jest.fn(async () => new Response(
      JSON.stringify({ error: "invalid_grant", assertion: "секрет" }),
      { status: 400 },
    )) as unknown as typeof fetch;
    await expect(serviceAccountAccessToken({ account, fetchImpl }))
      .rejects.toThrow("Vertex token exchange failed: HTTP 400");
  });
});

describe("B743 — регион у Vertex это условие работы, а не вкус", () => {
  /**
   * Разбор живых отказов в чужих клиентах (gemini-cli #19055, goose #6186,
   * vercel/ai #6811): семейство Gemini 3.x на региональном адресе отдаёт
   * `Publisher Model … was not found`. Наш автор стоит на 3.8-flash.
   */
  it("Gemini 3.x обслуживается только глобальным адресом", () => {
    expect(vertexLocationSupports("gemini-3.8-flash", "global")).toBe(true);
    expect(vertexLocationSupports("gemini-3.8-flash", "us-central1")).toBe(false);
    expect(vertexLocationSupports("gemini-3-flash-preview", "europe-west4")).toBe(false);
  });

  it("про остальные модели не гадаем: где что выкачено, меняется чаще нашего кода", () => {
    expect(vertexLocationSupports("gemini-2.5-flash", "us-central1")).toBe(true);
  });

  it("несовместимый регион отбивается понятной причиной, а не 404 в бою", async () => {
    const adapter = createVertexAdapter({
      serviceAccountJson: serviceAccountJson(),
      defaultModel: "gemini-3.8-flash",
      location: "us-central1",
      fetchImpl: (async () => {
        throw new Error("до сети дойти не должно");
      }) as unknown as typeof fetch,
    });
    // У 404 от Vertex текст «модель не найдена» — разбирательство ушло бы в
    // каталог моделей, а причина в регионе.
    await expect(adapter.complete({
      feature: "marketing-agent-writer",
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 10,
    })).rejects.toThrow(/только глобальным адресом/);
  });
});

describe("B742 — адрес модели у Vertex", () => {
  it("регион стоит и в хосте, и в пути: несовпадение даёт 404", () => {
    expect(vertexModelUrl({ projectId: "p", location: "europe-west4", model: "gemini-3.8-flash" }))
      .toBe("https://europe-west4-aiplatform.googleapis.com/v1/projects/p/locations/europe-west4"
        + "/publishers/google/models/gemini-3.8-flash:generateContent");
  });

  it("global адресуется без префикса региона в хосте", () => {
    // ⚠ Ровно на этом сломались три чужих клиента: они собирали
    // `https://global-aiplatform.googleapis.com`, хоста с таким именем нет.
    expect(vertexModelUrl({ projectId: "p", location: "global", model: "m" }))
      .toBe("https://aiplatform.googleapis.com/v1/projects/p/locations/global"
        + "/publishers/google/models/m:generateContent");
  });

  it("через шлюз меняется только хост, путь остаётся вертексовым", () => {
    const url = vertexModelUrl({
      projectId: "p",
      location: "global",
      model: "m",
      baseURL: "https://gateway.ai.cloudflare.com/v1/acc/gw/google-vertex-ai",
    });
    expect(url).toContain("gateway.ai.cloudflare.com");
    expect(url).toContain("/v1/projects/p/locations/global/publishers/google/models/m:generateContent");
  });
});

describe("B742 — адаптер ходит туда, куда обещает", () => {
  it("запрос уходит на Vertex с Bearer, а тело остаётся тем же, что у Gemini", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).includes("oauth2.googleapis.com")) {
        return new Response(JSON.stringify({ access_token: "ya29.t", expires_in: 3600 }), { status: 200 });
      }
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "готово" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3, totalTokenCount: 13 },
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const adapter = createVertexAdapter({
      serviceAccountJson: serviceAccountJson(),
      defaultModel: "gemini-3.8-flash",
      fetchImpl,
    });
    const response = await adapter.complete({
      feature: "marketing-agent-writer",
      messages: [
        { role: "system", content: "Ты редактор." },
        { role: "user", content: "Напиши." },
      ],
      maxTokens: 100,
      temperature: 0.3,
    });

    expect(response.text).toBe("готово");
    // Провайдер остаётся GEMINI: Vertex — дверь, а не поставщик. От этого
    // зависят потолок расхода, очередь и предпочтения моделей.
    expect(response.provider).toBe("GEMINI");

    const completion = calls.find((call) => call.url.includes("aiplatform"))!;
    expect(completion.url).toContain("/projects/eterapy-prod/locations/global/");
    expect(completion.url).toContain("models/gemini-3.8-flash:generateContent");
    const headers = completion.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer ya29.t");
    // Ключа AI Studio на этом маршруте быть не должно ни в каком виде.
    expect(headers["x-goog-api-key"]).toBeUndefined();
    const body = JSON.parse(String(completion.init.body));
    expect(body.systemInstruction).toEqual({ parts: [{ text: "Ты редактор." }] });
    expect(body.contents[0].role).toBe("user");
  });

  it("без сервисного аккаунта маршрут честно не поднимается", async () => {
    const adapter = createVertexAdapter({ serviceAccountJson: "AIza-обычный-ключ" });
    const health = await adapter.healthcheck("gemini-3.8-flash");
    expect(health.status).toBe("missing_config");
    expect(health.message).toContain("Vertex service account is not configured");
  });
});
