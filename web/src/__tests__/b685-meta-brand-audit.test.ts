/**
 * B685 — адресат Meta виден в админке ДО публикации.
 *
 * B682 научил код отказываться публиковать не от брендовой страницы, но узнать
 * об этом можно было только по отказу материала. Живая проверка 2026-08-06
 * показала, что оба маркера принадлежат ЛИЧНОМУ аккаунту `alexey_s_denisov`, —
 * и об этом ничего не говорила ни одна панель: строка коннектора считалась
 * «готово», потому что все поля заполнены. Заполнены они были неверно.
 *
 * Аудит отвечает на один вопрос: «от чьего имени уйдёт следующий пост».
 */
import {
  auditMetaBrandAccounts,
  resetMetaBrandAccountCache,
} from "@/lib/marketing/meta-brand-account";

const originalFetch = global.fetch;

function mockMeta(byHost: Record<string, unknown>) {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = url.includes("threads") ? "threads" : "instagram";
    const payload = byHost[key];
    if (payload instanceof Error) throw payload;
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    } as Response;
  }) as unknown as typeof fetch;
}

describe("B685 — аудит адресата Meta", () => {
  beforeEach(() => {
    resetMetaBrandAccountCache();
    process.env.THREADS_ACCESS_TOKEN = "th-token";
    process.env.THREADS_USER_ID = "1";
    process.env.INSTAGRAM_ACCESS_TOKEN = "ig-token";
    process.env.INSTAGRAM_USER_ID = "2";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("личный аккаунт помечается несовпадением, а не «готово»", async () => {
    mockMeta({
      threads: { id: "27155594637449426", username: "alexey_s_denisov" },
      instagram: { id: "37607994085513536", username: "alexey_s_denisov" },
    });

    const audit = await auditMetaBrandAccounts();

    expect(audit).toHaveLength(2);
    for (const row of audit) {
      expect(row.status).toBe("mismatch");
      expect(row.actualHandle).toBe("alexey_s_denisov");
      expect(row.expectedHandle).toBe("eterapy_official");
    }
  });

  it("брендовая страница проходит", async () => {
    mockMeta({
      threads: { id: "1", username: "eterapy_official" },
      instagram: { id: "2", username: "ETerapy_Official" },
    });

    const audit = await auditMetaBrandAccounts();

    expect(audit.map((row) => row.status)).toEqual(["ok", "ok"]);
  });

  it("недоступная площадка — «неизвестно», а не «совпало»", async () => {
    mockMeta({
      threads: new Error("fetch failed"),
      instagram: new Error("fetch failed"),
    });

    const audit = await auditMetaBrandAccounts();

    // Молчание сети НЕ засчитывается за подтверждение: иначе достаточно
    // отвалиться релею, чтобы панель показала зелёное на неверном аккаунте.
    expect(audit.map((row) => row.status)).toEqual(["unknown", "unknown"]);
    expect(audit[0].error).toContain("fetch failed");
  });

  it("без маркера площадка не подключена и в Meta не ходим", async () => {
    delete process.env.THREADS_ACCESS_TOKEN;
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;

    const audit = await auditMetaBrandAccounts();

    expect(audit.map((row) => row.status)).toEqual(["not_connected", "not_connected"]);
    expect(spy).not.toHaveBeenCalled();
  });
});
