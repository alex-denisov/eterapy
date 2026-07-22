/**
 * B541 — инвентарь флота.
 *
 * Процесс читает `FLEET_NODES` (JSON-массив) из окружения, но САМ источник
 * истины — `deploy/fleet-matrix.json`: выкатка собирает из него эту переменную
 * и кладёт в `/opt/eterapy/.env` (B569).
 *
 * Здесь раньше стояло «в репозитории адресов нет намеренно (B539)» — это было
 * неверно: адреса всё это время лежали в fleet-matrix.json, из которого
 * deploy.yml набирает ноды. Комментарий стоил панели пустого экрана: значение
 * полагалось вписать на хост руками, а владелец `.env` руками не правит, так
 * что FLEET_NODES не выставили нигде.
 *
 * Пример:
 *   FLEET_NODES='[{"name":"eterapy-1","host":"10.0.0.1","role":"primary","contour":"ru"}]'
 */

export const FLEET_NODE_ROLES = ["primary", "standby", "edge"] as const;
export type FleetNodeRole = (typeof FLEET_NODE_ROLES)[number];

export const FLEET_CONTOURS = ["ru", "foreign"] as const;
export type FleetContour = (typeof FLEET_CONTOURS)[number];

export type FleetNode = {
  /** Человекочитаемое имя ноды, совпадает с ключом деплой-матрицы. */
  name: string;
  host: string;
  role: FleetNodeRole;
  /** Контур данных: РФ-ПДн живут только в `ru` (152-ФЗ). */
  contour: FleetContour;
  /** База для агент-эндпоинтов; по умолчанию приложение слушает :3200. */
  baseUrl: string;
};

const DEFAULT_APP_PORT = 3200;

function isRole(value: unknown): value is FleetNodeRole {
  return FLEET_NODE_ROLES.includes(value as FleetNodeRole);
}

function isContour(value: unknown): value is FleetContour {
  return FLEET_CONTOURS.includes(value as FleetContour);
}

function normalizeNode(raw: unknown): FleetNode | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  const name = typeof record.name === "string" ? record.name.trim() : "";
  const host = typeof record.host === "string" ? record.host.trim() : "";
  if (!name || !host) return null;

  const baseUrl =
    typeof record.baseUrl === "string" && record.baseUrl.trim()
      ? record.baseUrl.trim().replace(/\/+$/, "")
      : `http://${host}:${DEFAULT_APP_PORT}`;

  return {
    name,
    host,
    role: isRole(record.role) ? record.role : "standby",
    contour: isContour(record.contour) ? record.contour : "ru",
    baseUrl,
  };
}

/** Разбирает `FLEET_NODES`; на любом мусоре возвращает пустой инвентарь. */
export function parseFleetNodes(raw: string | undefined | null): FleetNode[] {
  if (!raw || !raw.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map(normalizeNode)
    .filter((node): node is FleetNode => node !== null);
}

/** Инвентарь текущего процесса (server-side). */
export function getFleetNodes(): FleetNode[] {
  return parseFleetNodes(process.env.FLEET_NODES);
}

export function fleetNodeStatusUrl(node: FleetNode): string {
  return `${node.baseUrl}/api/ops/node-status`;
}

/**
 * Релиз ноды — это тег её образа: деплой пишет `ETERAPY_IMAGE=eterapy-web:<sha8>`
 * в `/opt/eterapy/.env`, а compose пробрасывает `.env` внутрь контейнера.
 */
export function parseReleaseSha(image: string | undefined | null): string | null {
  if (!image) return null;
  const tag = image.split(":").pop()?.trim() ?? "";
  if (!tag || tag === "latest" || tag === image.trim()) return null;
  return tag;
}
