/**
 * B541 — one-click redeploy через GitHub `workflow_dispatch`.
 *
 * PAT (`FLEET_GITHUB_TOKEN`, fine-grained, actions:write) живёт только в
 * `/opt/eterapy/.env`. Токен никогда не попадает ни в URL, ни в текст ошибки.
 */

export class FleetDispatchError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "FleetDispatchError";
    this.status = status;
  }
}

export type DispatchOptions = {
  repo: string;
  workflow: string;
  ref: string;
  /** Пустой список = весь флот. */
  nodes: string[];
  token: string;
  fetchImpl?: typeof fetch;
};

/** Убирает токен из любого текста, который может уйти в UI или в лог. */
function redact(text: string, token: string): string {
  if (!token) return text;
  return text.split(token).join("***");
}

export async function dispatchFleetDeploy({
  repo,
  workflow,
  ref,
  nodes,
  token,
  fetchImpl = fetch,
}: DispatchOptions): Promise<void> {
  if (!token) {
    throw new FleetDispatchError("FLEET_GITHUB_TOKEN не настроен — деплой из панели недоступен");
  }

  const response = await fetchImpl(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref,
        inputs: { nodes: nodes.length ? nodes.join(",") : "all" },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new FleetDispatchError(
      `GitHub отклонил запуск деплоя: HTTP ${response.status} ${redact(body, token).slice(0, 300)}`.trim(),
      response.status,
    );
  }
}

export function getFleetDispatchConfig() {
  return {
    repo: process.env.FLEET_GITHUB_REPO ?? "alex-denisov/eterapy",
    token: process.env.FLEET_GITHUB_TOKEN ?? "",
    ref: process.env.FLEET_DEPLOY_REF ?? "main",
    workflow: process.env.FLEET_DEPLOY_WORKFLOW ?? "deploy.yml",
  };
}
