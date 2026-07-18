/**
 * B544 — состояние хоста, собранное host-коллектором.
 *
 * Приложение НЕ имеет доступа к docker-сокету (сокет = root на хосте).
 * `deploy/agent/collect-node-state.sh` под systemd-таймером раз в минуту
 * пишет JSON в `/opt/eterapy/state/node-state.json`, который смонтирован в
 * контейнер read-only. Здесь — только разбор и оценка.
 */

/** Таймер бэкапа ходит раз в 6 часов: до 8ч — норма, после 12ч — потеря RPO. */
export const RPO_WARN_SEC = 8 * 3600;
export const RPO_FAIL_SEC = 12 * 3600;

/** Коллектор ходит раз в минуту; 5 минут молчания = коллектор мёртв. */
const STALE_AFTER_SEC = 300;

export type ContainerState = {
  name: string;
  image: string;
  tag: string;
  state: string;
  health: string;
  uptime: string;
};

export type BackupState = {
  timer: string;
  lastFile: string | null;
  ageSec: number | null;
  sizeBytes: number | null;
};

export type BucketState = {
  remote: string;
  objects: number;
  lastObject: string | null;
  ageSec: number | null;
  ok: boolean;
};

export type HaproxyState = { state: string; version: string };

/** B537: репликация async — секунды отставания это норма, минуты уже нет. */
export const REPL_LAG_WARN_SEC = 30;
export const REPL_LAG_FAIL_SEC = 300;

export type ReplicaState = { name: string; state: string; lagBytes: number };

export type ReplicationState = {
  role: "primary" | "standby" | "none";
  ok: boolean;
  streamStatus: string;
  lagSeconds: number | null;
  replicas: ReplicaState[];
};

export type NodeState = {
  collectedAt: string | null;
  ageSec: number | null;
  stale: boolean;
  containers: ContainerState[];
  backup: BackupState | null;
  buckets: BucketState[];
  haproxy: HaproxyState | null;
  replication: ReplicationState | null;
};

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseContainer(raw: unknown): ContainerState | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const name = str(record.name);
  if (!name) return null;
  return {
    name,
    image: str(record.image),
    tag: str(record.tag),
    state: str(record.state),
    health: str(record.health),
    uptime: str(record.uptime),
  };
}

function parseReplica(raw: unknown): ReplicaState | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const name = str(record.name);
  if (!name) return null;
  return { name, state: str(record.state), lagBytes: num(record.lagBytes) ?? 0 };
}

function parseReplication(raw: unknown): ReplicationState | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const role = str(record.role);
  if (role !== "primary" && role !== "standby" && role !== "none") return null;
  return {
    role,
    ok: record.ok === true,
    streamStatus: str(record.streamStatus),
    lagSeconds: num(record.lagSeconds),
    replicas: Array.isArray(record.replicas)
      ? record.replicas.map(parseReplica).filter((r): r is ReplicaState => r !== null)
      : [],
  };
}

function parseBucket(raw: unknown): BucketState | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const remote = str(record.remote);
  if (!remote) return null;
  return {
    remote,
    objects: num(record.objects) ?? 0,
    lastObject: typeof record.lastObject === "string" ? record.lastObject : null,
    ageSec: num(record.ageSec),
    ok: record.ok === true,
  };
}

/** Разбирает вывод коллектора. На любом мусоре возвращает null. */
export function parseNodeState(raw: unknown, nowMs: number = Date.now()): NodeState | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;

  const collectedAt = typeof record.collectedAt === "string" ? record.collectedAt : null;
  const collectedMs = collectedAt ? Date.parse(collectedAt) : NaN;
  const ageSec = Number.isFinite(collectedMs) ? Math.round((nowMs - collectedMs) / 1000) : null;

  const backupRaw = record.backup as Record<string, unknown> | undefined;

  return {
    collectedAt,
    ageSec,
    // Нет отметки времени — считаем протухшим: молчание хуже, чем плохие новости.
    stale: ageSec === null ? true : ageSec > STALE_AFTER_SEC,
    containers: Array.isArray(record.containers)
      ? record.containers.map(parseContainer).filter((c): c is ContainerState => c !== null)
      : [],
    backup: backupRaw
      ? {
          timer: str(backupRaw.timer, "unknown"),
          lastFile: typeof backupRaw.lastFile === "string" ? backupRaw.lastFile : null,
          ageSec: num(backupRaw.ageSec),
          sizeBytes: num(backupRaw.sizeBytes),
        }
      : null,
    buckets: Array.isArray(record.buckets)
      ? record.buckets.map(parseBucket).filter((b): b is BucketState => b !== null)
      : [],
    haproxy:
      record.haproxy && typeof record.haproxy === "object"
        ? {
            state: str((record.haproxy as Record<string, unknown>).state, "unknown"),
            version: str((record.haproxy as Record<string, unknown>).version),
          }
        : null,
    // Ноды со старым коллектором просто не отдают поле — секция скрывается.
    replication: parseReplication(record.replication),
  };
}

/**
 * B537 — цвет для лага реплики. Primary без единой подключённой реплики
 * считается сбоем: слот держит WAL, и диск primary кончится, если standby
 * отвалился надолго.
 */
export function replicationTone(state: ReplicationState | null): "ok" | "warn" | "danger" | "none" {
  if (!state || state.role === "none") return "none";
  if (!state.ok) return "danger";
  const lag = state.role === "standby" ? state.lagSeconds : null;
  if (lag !== null && lag >= REPL_LAG_FAIL_SEC) return "danger";
  if (lag !== null && lag >= REPL_LAG_WARN_SEC) return "warn";
  return "ok";
}

export type ContainerSummary = {
  total: number;
  running: number;
  unhealthy: number;
  /** Версии образа приложения на ноде: >1 значит частичное обновление. */
  appVersions: string[];
};

export function summarizeContainers(containers: ContainerState[]): ContainerSummary {
  const appVersions = [
    ...new Set(
      containers
        .filter((container) => container.image.startsWith("eterapy-web"))
        .map((container) => container.tag)
        .filter(Boolean),
    ),
  ].sort();

  return {
    total: containers.length,
    running: containers.filter((container) => container.state === "running").length,
    unhealthy: containers.filter((container) => container.health === "unhealthy").length,
    appVersions,
  };
}

export function backupTone(ageSec: number | null): "ok" | "warn" | "danger" {
  if (ageSec === null) return "danger";
  if (ageSec > RPO_FAIL_SEC) return "danger";
  if (ageSec > RPO_WARN_SEC) return "warn";
  return "ok";
}
