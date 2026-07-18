import fs from "node:fs";
import path from "node:path";

/**
 * B540 — RU-контур обслуживают ДВЕ app-ноды за HAProxy на eterapy-1. Живучесть
 * этой схемы держится на двух вещах в репозитории, которые легко потерять
 * правкой compose:
 *   1. app-порт публикуется наружу контейнера (иначе LB соседней ноды не
 *      достучится и node-b навсегда останется DOWN);
 *   2. по умолчанию публикация ТОЛЬКО на loopback — app-порт не должен уехать
 *      в интернет, если кто-то забудет ETERAPY_WEB_BIND.
 * CI перезаписывает /opt/eterapy/docker-compose.yml из репо, поэтому падение
 * этого контракта чинится не на ноде, а здесь.
 */
const repoRoot = path.resolve(process.cwd(), "..");
const read = (...p: string[]) => fs.readFileSync(path.join(repoRoot, ...p), "utf8");

const compose = read("deploy", "compose", "docker-compose.yml");
const lbCompose = read("deploy", "lb", "docker-compose.lb.yml");
const haproxy = read("deploy", "lb", "haproxy.cfg");

describe("B540 · контурный LB", () => {
  it("app-порт публикуется на хост, по умолчанию — на loopback", () => {
    expect(compose).toContain("${ETERAPY_WEB_BIND:-127.0.0.1}:${ETERAPY_APP_PORT:-3200}:3000");
  });

  it("HAProxy поднимается только под профилем lb", () => {
    expect(lbCompose).toMatch(/haproxy:[\s\S]*?profiles:\s*\["lb"\]/);
  });

  it("адреса нод контура обязательны — молчаливого старта с дефолтом нет", () => {
    expect(lbCompose).toMatch(/LB_NODE_A:\s*\$\{LB_NODE_A:\?/);
    expect(lbCompose).toMatch(/LB_NODE_B:\s*\$\{LB_NODE_B:\?/);
  });

  it("LB слушает loopback, а не 0.0.0.0 — TLS и vhost'ы остаются у фронта", () => {
    expect(haproxy).toContain("bind 127.0.0.1:${LB_BIND_PORT}");
    expect(haproxy).not.toMatch(/bind\s+(\*|0\.0\.0\.0|:)\d/);
  });

  it("мёртвая нода прячется: health-check по /api/health + redispatch", () => {
    expect(haproxy).toContain("http-check send meth GET uri /api/health");
    expect(haproxy).toContain("http-check expect status 200");
    expect(haproxy).toContain("option redispatch");
    expect(haproxy).toMatch(/retries\s+[1-9]/);
  });

  it("оба бэкенда контура объявлены и sticky-cookie включена", () => {
    expect(haproxy).toContain("server node-a ${LB_NODE_A}");
    expect(haproxy).toContain("server node-b ${LB_NODE_B}");
    expect(haproxy).toMatch(/cookie SRVID insert[\s\S]*?httponly secure/);
  });
});
