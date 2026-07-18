/**
 * B541 — суперадминка «Мониторинг флота».
 * Покрывает: инвентарь нод из env, сбор статуса с таймаутом/ошибками,
 * one-click redeploy через GitHub workflow_dispatch.
 */
import { parseFleetNodes, fleetNodeStatusUrl, parseReleaseSha } from "@/lib/fleet/nodes";
import { collectFleetStatus, summarizeFleet } from "@/lib/fleet/status";
import { dispatchFleetDeploy, FleetDispatchError } from "@/lib/fleet/dispatch";

describe("B541 · инвентарь флота (parseFleetNodes)", () => {
  it("возвращает пустой список без конфигурации (никаких хардкод-IP в репозитории)", () => {
    expect(parseFleetNodes(undefined)).toEqual([]);
    expect(parseFleetNodes("")).toEqual([]);
    expect(parseFleetNodes("   ")).toEqual([]);
  });

  it("парсит JSON-массив нод и нормализует поля", () => {
    const nodes = parseFleetNodes(
      JSON.stringify([
        { name: "eterapy-1", host: "10.0.0.1", role: "primary", contour: "ru" },
        { name: "eterapy-4", host: "10.0.0.4", role: "edge", contour: "foreign", baseUrl: "http://10.0.0.4:3200" },
      ]),
    );

    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ name: "eterapy-1", host: "10.0.0.1", role: "primary", contour: "ru" });
    expect(nodes[1].baseUrl).toBe("http://10.0.0.4:3200");
  });

  it("подставляет baseUrl по умолчанию из host", () => {
    const [node] = parseFleetNodes(JSON.stringify([{ name: "n1", host: "10.0.0.1" }]));
    expect(node.baseUrl).toBe("http://10.0.0.1:3200");
    expect(node.role).toBe("standby");
    expect(node.contour).toBe("ru");
  });

  it("отбрасывает записи без имени или хоста и не падает на мусоре", () => {
    expect(parseFleetNodes(JSON.stringify([{ name: "n1" }, { host: "h" }, null, 42]))).toEqual([]);
    expect(parseFleetNodes("{not json")).toEqual([]);
    expect(parseFleetNodes(JSON.stringify({ name: "n1", host: "h" }))).toEqual([]);
  });

  it("вытаскивает релиз-SHA из тега образа (ETERAPY_IMAGE)", () => {
    expect(parseReleaseSha("eterapy-web:b08d2bcc")).toBe("b08d2bcc");
    expect(parseReleaseSha("registry.example.com/eterapy-web:abc1234")).toBe("abc1234");
    expect(parseReleaseSha("eterapy-web:latest")).toBeNull();
    expect(parseReleaseSha("eterapy-web")).toBeNull();
    expect(parseReleaseSha(undefined)).toBeNull();
  });

  it("строит URL агент-эндпоинта ноды", () => {
    const [node] = parseFleetNodes(JSON.stringify([{ name: "n1", host: "10.0.0.1" }]));
    expect(fleetNodeStatusUrl(node)).toBe("http://10.0.0.1:3200/api/ops/node-status");
  });
});

describe("B541 · сбор статуса флота (collectFleetStatus)", () => {
  const nodes = parseFleetNodes(
    JSON.stringify([
      { name: "eterapy-1", host: "10.0.0.1", role: "primary", contour: "ru" },
      { name: "eterapy-2", host: "10.0.0.2", role: "standby", contour: "ru" },
    ]),
  );

  it("возвращает статус каждой ноды в порядке инвентаря", async () => {
    const fetchImpl = jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({
        node: url.includes("10.0.0.1") ? "eterapy-1" : "eterapy-2",
        releaseSha: "b08d2bcc",
        health: "ok",
        uptimeSec: 120,
        disk: { usedPct: 68 },
        memory: { usedPct: 41 },
      }),
    })) as unknown as typeof fetch;

    const result = await collectFleetStatus(nodes, { fetchImpl });

    expect(result.map((r) => r.node.name)).toEqual(["eterapy-1", "eterapy-2"]);
    expect(result[0].ok).toBe(true);
    expect(result[0].releaseSha).toBe("b08d2bcc");
    expect(result[0].disk?.usedPct).toBe(68);
  });

  it("не роняет весь сбор из-за одной упавшей ноды", async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.includes("10.0.0.2")) throw new Error("ECONNREFUSED");
      return { ok: true, status: 200, json: async () => ({ health: "ok", releaseSha: "abc" }) };
    }) as unknown as typeof fetch;

    const result = await collectFleetStatus(nodes, { fetchImpl });

    expect(result[0].ok).toBe(true);
    expect(result[1].ok).toBe(false);
    expect(result[1].error).toContain("ECONNREFUSED");
  });

  it("помечает ноду недоступной при не-2xx ответе", async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch;
    const result = await collectFleetStatus(nodes.slice(0, 1), { fetchImpl });
    expect(result[0].ok).toBe(false);
    expect(result[0].error).toContain("401");
  });

  it("передаёт ops-секрет заголовком, а не в URL", async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ health: "ok" }) })) as unknown as typeof fetch;
    await collectFleetStatus(nodes.slice(0, 1), { fetchImpl, opsSecret: "s3cret" });

    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(url).not.toContain("s3cret");
    expect((init.headers as Record<string, string>)["x-ops-secret"]).toBe("s3cret");
  });

  it("сводка считает живые/мёртвые ноды и рассинхрон релизов", () => {
    const summary = summarizeFleet([
      { node: nodes[0], ok: true, releaseSha: "aaa" },
      { node: nodes[1], ok: false, error: "down" },
    ]);
    expect(summary).toMatchObject({ total: 2, up: 1, down: 1, releaseMismatch: false });

    const mismatched = summarizeFleet([
      { node: nodes[0], ok: true, releaseSha: "aaa" },
      { node: nodes[1], ok: true, releaseSha: "bbb" },
    ]);
    expect(mismatched.releaseMismatch).toBe(true);
  });
});

describe("B541 · one-click redeploy (dispatchFleetDeploy)", () => {
  const base = { repo: "alex-denisov/eterapy", token: "ghp_test", ref: "main" };

  it("шлёт workflow_dispatch с ref и inputs", async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, status: 204, text: async () => "" })) as unknown as typeof fetch;

    await dispatchFleetDeploy({ ...base, workflow: "deploy.yml", nodes: ["eterapy-1"], fetchImpl });

    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/alex-denisov/eterapy/actions/workflows/deploy.yml/dispatches");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer ghp_test");
    expect(JSON.parse(init.body)).toEqual({ ref: "main", inputs: { nodes: "eterapy-1" } });
  });

  it("для всего флота передаёт inputs.nodes = all", async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, status: 204, text: async () => "" })) as unknown as typeof fetch;
    await dispatchFleetDeploy({ ...base, workflow: "deploy.yml", nodes: [], fetchImpl });
    expect(JSON.parse((fetchImpl as unknown as jest.Mock).mock.calls[0][1].body).inputs.nodes).toBe("all");
  });

  it("бросает FleetDispatchError без токена (секрет не подставляется молча)", async () => {
    await expect(
      dispatchFleetDeploy({ ...base, token: "", workflow: "deploy.yml", nodes: [] }),
    ).rejects.toBeInstanceOf(FleetDispatchError);
  });

  it("бросает FleetDispatchError с телом ответа при ошибке GitHub", async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 403, text: async () => "Resource not accessible" })) as unknown as typeof fetch;

    await expect(
      dispatchFleetDeploy({ ...base, workflow: "deploy.yml", nodes: [], fetchImpl }),
    ).rejects.toThrow(/403/);
  });

  it("не логирует токен в тексте ошибки", async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 401, text: async () => "Bad credentials ghp_test" })) as unknown as typeof fetch;

    await expect(
      dispatchFleetDeploy({ ...base, workflow: "deploy.yml", nodes: [], fetchImpl }),
    ).rejects.toThrow(/^(?!.*ghp_test).*$/s);
  });
});
