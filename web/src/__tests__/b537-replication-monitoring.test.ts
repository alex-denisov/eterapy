import { parseNodeState, replicationTone } from "@/lib/fleet/node-state";

/**
 * B537 — лаг реплики в панели флота. Сигнал должен быть честным в обе
 * стороны: и когда standby отстал, и когда primary вообще потерял реплику
 * (тогда слот копит WAL и однажды доедает диск primary).
 */
const base = {
  collectedAt: new Date().toISOString(),
  containers: [],
  backup: null,
  buckets: [],
  haproxy: { state: "absent", version: "" },
};

describe("B537 · репликация в мониторинге флота", () => {
  it("разбирает primary с подключённой репликой", () => {
    const state = parseNodeState({
      ...base,
      replication: {
        role: "primary",
        ok: true,
        streamStatus: "",
        lagSeconds: null,
        replicas: [{ name: "eterapy2", state: "streaming", lagBytes: 0 }],
      },
    });
    expect(state?.replication?.role).toBe("primary");
    expect(state?.replication?.replicas).toEqual([
      { name: "eterapy2", state: "streaming", lagBytes: 0 },
    ]);
    expect(replicationTone(state!.replication)).toBe("ok");
  });

  it("primary без реплик — красный, а не «нет данных»", () => {
    const state = parseNodeState({
      ...base,
      replication: { role: "primary", ok: false, streamStatus: "", lagSeconds: null, replicas: [] },
    });
    expect(replicationTone(state!.replication)).toBe("danger");
  });

  it("standby со свежим потоком — зелёный", () => {
    const state = parseNodeState({
      ...base,
      replication: { role: "standby", ok: true, streamStatus: "streaming", lagSeconds: 2, replicas: [] },
    });
    expect(replicationTone(state!.replication)).toBe("ok");
  });

  it("лаг standby переходит из warn в danger по порогам", () => {
    const at = (lagSeconds: number) =>
      replicationTone(
        parseNodeState({
          ...base,
          replication: { role: "standby", ok: true, streamStatus: "streaming", lagSeconds, replicas: [] },
        })!.replication,
      );
    expect(at(29)).toBe("ok");
    expect(at(30)).toBe("warn");
    expect(at(299)).toBe("warn");
    expect(at(300)).toBe("danger");
  });

  it("оборванный поток на standby — danger независимо от лага", () => {
    const state = parseNodeState({
      ...base,
      replication: { role: "standby", ok: false, streamStatus: "", lagSeconds: 0, replicas: [] },
    });
    expect(replicationTone(state!.replication)).toBe("danger");
  });

  it("нода без репликации не поднимает тревогу", () => {
    const state = parseNodeState({
      ...base,
      replication: { role: "none", ok: false, streamStatus: "", lagSeconds: null, replicas: [] },
    });
    expect(replicationTone(state!.replication)).toBe("none");
  });

  it("старый коллектор без поля replication не ломает разбор", () => {
    const state = parseNodeState(base);
    expect(state).not.toBeNull();
    expect(state?.replication).toBeNull();
    expect(replicationTone(state!.replication)).toBe("none");
  });

  it("мусор в поле не роняет панель", () => {
    for (const junk of [{ role: "мусор" }, "строка", 42, null, { role: "primary", replicas: "нет" }]) {
      const state = parseNodeState({ ...base, replication: junk });
      expect(state).not.toBeNull();
      if (junk && typeof junk === "object" && (junk as { role?: string }).role === "primary") {
        expect(state?.replication?.replicas).toEqual([]);
      } else {
        expect(state?.replication).toBeNull();
      }
    }
  });
});
