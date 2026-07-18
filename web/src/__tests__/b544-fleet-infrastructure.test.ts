/**
 * B544 — полноценный мониторинг флота: контейнеры с версиями, бэкапы,
 * бакеты, HAProxy, Cloudflare-воркеры.
 */
import { parseNodeState, summarizeContainers, RPO_WARN_SEC, RPO_FAIL_SEC } from "@/lib/fleet/node-state";
import { checkCloudflareWorkers } from "@/lib/fleet/cloudflare";

const SAMPLE = {
  collectedAt: "2026-07-18T12:00:00Z",
  containers: [
    { name: "eterapy-web-1", image: "eterapy-web:2cf6f341", tag: "2cf6f341", state: "running", health: "healthy", uptime: "5 minutes ago" },
    { name: "eterapy-worker-1", image: "eterapy-web:2cf6f341", tag: "2cf6f341", state: "running", health: "", uptime: "5 minutes ago" },
    { name: "eterapy-migrate-1", image: "eterapy-web:2cf6f341", tag: "2cf6f341", state: "exited", health: "", uptime: "5 minutes ago" },
    { name: "livekit", image: "livekit/livekit-server:latest", tag: "latest", state: "running", health: "", uptime: "7 weeks ago" },
  ],
  backup: { timer: "active", lastFile: "eterapy-1-eterapy-20260718T092419Z.dump.gpg", ageSec: 12630, sizeBytes: 1360041 },
  buckets: [
    { remote: "cloudru1", objects: 4, lastObject: "x-20260718T092419Z.dump.gpg", ageSec: 12630, ok: true },
    { remote: "cloudru2", objects: 4, lastObject: "x-20260718T092419Z.dump.gpg", ageSec: 12631, ok: true },
  ],
  haproxy: { state: "absent", version: "" },
};

const NOW = Date.parse("2026-07-18T12:00:30Z");

describe("B544 · состояние ноды из host-коллектора", () => {
  it("разбирает контейнеры с версиями образов", () => {
    const state = parseNodeState(SAMPLE, NOW);
    expect(state).not.toBeNull();
    expect(state!.containers).toHaveLength(4);
    expect(state!.containers[0]).toMatchObject({ name: "eterapy-web-1", tag: "2cf6f341", state: "running", health: "healthy" });
    expect(state!.containers[3].image).toBe("livekit/livekit-server:latest");
  });

  it("считает свежесть сбора и помечает протухшее состояние", () => {
    expect(parseNodeState(SAMPLE, NOW)!.stale).toBe(false);
    // таймер раз в минуту: 10 минут молчания — коллектор мёртв
    const late = Date.parse("2026-07-18T12:10:00Z");
    expect(parseNodeState(SAMPLE, late)!.stale).toBe(true);
  });

  it("не падает на мусоре и на отсутствующем файле", () => {
    expect(parseNodeState(null, NOW)).toBeNull();
    expect(parseNodeState("не json", NOW)).toBeNull();
    expect(parseNodeState({}, NOW)!.containers).toEqual([]);
  });

  it("сводка контейнеров: running/exited/unhealthy", () => {
    const summary = summarizeContainers(parseNodeState(SAMPLE, NOW)!.containers);
    // migrate-1 отработал и вышел — это норма, не «упал»
    expect(summary).toMatchObject({ total: 4, running: 3, unhealthy: 0 });
  });

  it("unhealthy-контейнер попадает в сводку", () => {
    const broken = { ...SAMPLE, containers: [{ name: "x", image: "i:1", tag: "1", state: "running", health: "unhealthy", uptime: "1m" }] };
    expect(summarizeContainers(parseNodeState(broken, NOW)!.containers).unhealthy).toBe(1);
  });

  it("рассинхрон версий контейнеров приложения виден", () => {
    const mixed = {
      ...SAMPLE,
      containers: [
        { name: "eterapy-web-1", image: "eterapy-web:aaa", tag: "aaa", state: "running", health: "healthy", uptime: "1m" },
        { name: "eterapy-worker-1", image: "eterapy-web:bbb", tag: "bbb", state: "running", health: "", uptime: "1m" },
      ],
    };
    expect(summarizeContainers(parseNodeState(mixed, NOW)!.containers).appVersions).toEqual(["aaa", "bbb"]);
  });
});

describe("B544 · RPO бэкапов и бакеты", () => {
  it("свежий бэкап — ок", () => {
    const state = parseNodeState(SAMPLE, NOW)!;
    expect(state.backup!.ageSec).toBeLessThan(RPO_WARN_SEC);
    expect(state.backup!.timer).toBe("active");
  });

  it("пороги RPO упорядочены и соответствуют таймеру 6ч", () => {
    expect(RPO_WARN_SEC).toBeLessThan(RPO_FAIL_SEC);
    expect(RPO_WARN_SEC).toBeGreaterThanOrEqual(6 * 3600);
  });

  it("бакеты разбираются с числом объектов и возрастом", () => {
    const buckets = parseNodeState(SAMPLE, NOW)!.buckets;
    expect(buckets.map((b) => b.remote)).toEqual(["cloudru1", "cloudru2"]);
    expect(buckets[0].objects).toBe(4);
    expect(buckets[0].ok).toBe(true);
  });

  it("пустой бакет — это НЕ ок (бэкапы не доезжают)", () => {
    const empty = { ...SAMPLE, buckets: [{ remote: "cloudru1", objects: 0, lastObject: null, ageSec: null, ok: false }] };
    expect(parseNodeState(empty, NOW)!.buckets[0].ok).toBe(false);
  });

  it("HAProxy честно сообщает, что ещё не развёрнут (B540)", () => {
    expect(parseNodeState(SAMPLE, NOW)!.haproxy!.state).toBe("absent");
  });
});

describe("B544 · Cloudflare-воркеры", () => {
  it("без токена — «не настроено», а не ошибка", async () => {
    const result = await checkCloudflareWorkers({ accountId: "acc", token: "" });
    expect(result.status).toBe("missing_config");
    expect(result.workers).toEqual([]);
  });

  it("возвращает список воркеров с датой деплоя", async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        result: [
          { id: "eterapy-tg-relay", modified_on: "2026-07-01T10:00:00Z" },
          { id: "eterapy-geo-router", modified_on: "2026-07-18T09:00:00Z" },
        ],
      }),
    })) as unknown as typeof fetch;

    const result = await checkCloudflareWorkers({ accountId: "acc", token: "cf_token", fetchImpl });

    expect(result.status).toBe("ok");
    expect(result.workers.map((w) => w.name)).toEqual(["eterapy-tg-relay", "eterapy-geo-router"]);
    expect(result.workers[0].modifiedOn).toBe("2026-07-01T10:00:00Z");
  });

  it("токен уходит заголовком и не светится в URL", async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ success: true, result: [] }) })) as unknown as typeof fetch;
    await checkCloudflareWorkers({ accountId: "acc", token: "cf_token", fetchImpl });
    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(url).not.toContain("cf_token");
    expect(init.headers.Authorization).toBe("Bearer cf_token");
  });

  it("ошибка API не роняет панель и не раскрывает токен", async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 403, json: async () => ({}), text: async () => "bad token cf_token" })) as unknown as typeof fetch;
    const result = await checkCloudflareWorkers({ accountId: "acc", token: "cf_token", fetchImpl });
    expect(result.status).toBe("down");
    expect(result.detail).not.toContain("cf_token");
  });

  it("сетевой сбой тоже деградирует мягко", async () => {
    const fetchImpl = jest.fn(async () => { throw new Error("ENOTFOUND"); }) as unknown as typeof fetch;
    const result = await checkCloudflareWorkers({ accountId: "acc", token: "cf_token", fetchImpl });
    expect(result.status).toBe("down");
    expect(result.detail).toContain("ENOTFOUND");
  });
});
