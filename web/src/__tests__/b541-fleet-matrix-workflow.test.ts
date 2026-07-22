import fs from "node:fs";
import path from "node:path";
import { parseFleetNodes } from "@/lib/fleet/nodes";

/**
 * B541 — deploy.yml берёт матрицу из deploy/fleet-matrix.json, а панель
 * суперадмина дёргает workflow_dispatch по slug ноды. Если эти два места
 * разъедутся, one-click redeploy молча ничего не задеплоит.
 */
const repoRoot = path.resolve(process.cwd(), "..");
const matrixPath = path.join(repoRoot, "deploy", "fleet-matrix.json");
const deployWorkflow = path.join(repoRoot, ".github", "workflows", "deploy.yml");

describe("B541 · инвентарь флота ↔ deploy.yml", () => {
  const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8")) as Array<Record<string, string>>;
  const workflow = fs.readFileSync(deployWorkflow, "utf8");

  it("каждая нода матрицы описана полностью", () => {
    expect(matrix.length).toBeGreaterThan(0);
    for (const vm of matrix) {
      expect(vm.slug).toMatch(/^eterapy-\d+$/);
      expect(vm.host).toBeTruthy();
      expect(vm.user).toBeTruthy();
      expect(vm.compose).toMatch(/^docker-compose.*\.yml$/);
      expect(typeof vm.profile_args).toBe("string");
    }
  });

  it("slug'и уникальны (иначе редеплой попадёт не на ту ноду)", () => {
    const slugs = matrix.map((vm) => vm.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("deploy.yml строит матрицу из fleet-matrix.json и принимает input nodes", () => {
    expect(workflow).toContain("deploy/fleet-matrix.json");
    expect(workflow).toContain("fromJSON(needs.plan.outputs.vms)");
    expect(workflow).toMatch(/^\s{6}nodes:$/m);
  });

  it("недоверенный input nodes не интерполируется в shell-команду", () => {
    expect(workflow).not.toContain("${{ inputs.nodes }}\"");
    // Допустимо только присвоение в env-блоке.
    const interpolations = workflow.match(/\$\{\{\s*inputs\.nodes\s*\}\}/g) ?? [];
    expect(interpolations).toHaveLength(1);
    expect(workflow).toContain("NODES: ${{ inputs.nodes }}");
  });

  it("формат fleet-matrix.json совместим с FLEET_NODES панели", () => {
    const nodes = parseFleetNodes(
      JSON.stringify(matrix.map((vm) => ({ name: vm.slug, host: vm.host }))),
    );
    expect(nodes.map((n) => n.name)).toEqual(matrix.map((vm) => vm.slug));
  });

  // B569: панель мониторинга на проде была пуста, потому что FLEET_NODES никто
  // не выставил — значение полагалось вписать в /opt/eterapy/.env руками, а
  // владелец .env руками не правит. Роль и контур переезжают в матрицу, чтобы
  // инвентарь имел ОДИН источник истины и уезжал на ноды выкаткой.
  it("каждая нода объявляет роль и контур", () => {
    for (const vm of matrix) {
      expect(["primary", "standby", "edge"]).toContain(vm.role);
      expect(["ru", "foreign"]).toContain(vm.contour);
    }
  });

  // B572: адрес опроса обязан быть задан явно — умолчание `http://<ip>:3200`
  // из nodes.ts всегда таймаутит, порт наружу не смотрит.
  //
  // Loopback для своего узла не годится: прод раздаётся с ДВУХ нод за HAProxy,
  // и когда панель отрисовала eterapy-2, `127.0.0.1:3200` ведёт в eterapy-2 —
  // строка eterapy-1 показывала «нет агента». Публичный адрес тоже не подошёл:
  // у eterapy-1 nginx с сертификатом только на eterapy.com, и запрос соседа на
  // `https://<ip>.sslip.io` падает в TLS (замерено с eterapy-2: HTTP 000).
  //
  // RU-ноды опрашиваются по WireGuard — мост уже несёт репликацию PG и
  // HAProxy-пиринг, адрес не зависит от того, какая нода отрисовала страницу, и
  // порт не выходит в интернет. Foreign-ноды в мост не входят — им sslip.io.
  it("RU-ноды опрашиваются по WireGuard, foreign — по sslip.io", () => {
    for (const vm of matrix) {
      expect(vm.baseUrl).toBeTruthy();
      if (vm.contour === "ru") {
        expect(vm.webBind).toMatch(/^10\.77\.0\.\d+$/);
        expect(vm.baseUrl).toBe(`http://${vm.webBind}:3200`);
      } else {
        expect(vm.webBind).toBe("");
        expect(vm.baseUrl).toBe(`https://${vm.host}.sslip.io`);
      }
    }
  });

  it("WG-адреса уникальны — иначе две ноды отвечают за одну строку панели", () => {
    const binds = matrix.map((vm) => vm.webBind).filter(Boolean);
    expect(binds.length).toBeGreaterThan(1);
    expect(new Set(binds).size).toBe(binds.length);
  });

  // Адрес привязки перестаёт быть node-local: на eterapy-2 `ETERAPY_WEB_BIND`
  // был вписан в /opt/eterapy/.env руками (B540) и потерялся бы при пересборке
  // ноды. Теперь он едет из матрицы выкаткой.
  it("deploy.yml доставляет ETERAPY_WEB_BIND из матрицы", () => {
    expect(workflow).toContain("ETERAPY_WEB_BIND");
    expect(workflow).toContain("NODE_WEB_BIND");
  });

  // Хост-сетевой ноде docker порт не публикует: Next слушает ОДИН адрес
  // (--hostname), и переставить его на WG значит отобрать 127.0.0.1 у nginx.
  // Поэтому на такой ноде WG-адрес отдаёт systemd-socket-proxyd.
  it("хост-сетевая нода получает WG-приёмник через socket-proxy", () => {
    expect(workflow).toContain("eterapy-wg-proxy.socket");
    expect(workflow).toContain("eterapy-wg-proxy.service");
    for (const file of ["eterapy-wg-proxy.socket", "eterapy-wg-proxy.service"]) {
      expect(fs.existsSync(path.join(repoRoot, "deploy", "agent", file))).toBe(true);
    }
  });

  it("ровно одна нода — primary", () => {
    expect(matrix.filter((vm) => vm.role === "primary")).toHaveLength(1);
  });

  // Ровно та проекция, которую deploy.yml кладёт в FLEET_NODES. `name` — это
  // slug, а не человекочитаемое имя матрицы: панель редеплоя ходит по слагам.
  it("проекция матрицы в FLEET_NODES разбирается панелью без потерь", () => {
    const nodes = parseFleetNodes(
      JSON.stringify(
        matrix.map((vm) => ({
          name: vm.slug,
          host: vm.host,
          role: vm.role,
          contour: vm.contour,
          baseUrl: vm.baseUrl,
        })),
      ),
    );
    expect(nodes).toHaveLength(matrix.length);
    expect(nodes.map((n) => n.name)).toEqual(matrix.map((vm) => vm.slug));
    expect(nodes.map((n) => n.role)).toEqual(matrix.map((vm) => vm.role));
    expect(nodes.map((n) => n.contour)).toEqual(matrix.map((vm) => vm.contour));
    expect(nodes.map((n) => n.baseUrl)).toEqual(matrix.map((vm) => vm.baseUrl));
  });

  it("deploy.yml собирает FLEET_NODES из матрицы и доставляет ключи Cloudflare", () => {
    expect(workflow).toContain("FLEET_NODES");
    expect(workflow).toContain("CLOUDFLARE_ACCOUNT_ID");
    expect(workflow).toContain("CLOUDFLARE_API_TOKEN");
    // Инвентарь строится из файла, а не из выборки нод: панель показывает весь
    // флот, даже когда выкатывают одну ноду.
    expect(workflow).toMatch(/FLEET_NODES=\$\(jq -c[\s\S]*?deploy\/fleet-matrix\.json\)/);
  });
});
