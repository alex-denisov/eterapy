import fs from "node:fs";
import path from "node:path";

/**
 * B542 — RU-кластер LiveKit: Redis-mesh на двух нодах (eterapy-1 + eterapy-2),
 * сигналинг за контурным HAProxy, медиа напрямую к нодам. Контракт держится
 * на трёх файлах репозитория, которые CI раскатывает на ноды; потерять его
 * правкой compose/матрицы легко, чинится он здесь, а не на ноде.
 */
const repoRoot = path.resolve(process.cwd(), "..");
const read = (...p: string[]) => fs.readFileSync(path.join(repoRoot, ...p), "utf8");

const overlay = read("deploy", "compose", "docker-compose.livekit.yml");
const example = read("deploy", "compose", "livekit.yaml.example");
const haproxy = read("deploy", "lb", "haproxy.cfg");
const lbCompose = read("deploy", "lb", "docker-compose.lb.yml");
const workflow = read(".github", "workflows", "deploy.yml");
const matrix = JSON.parse(read("deploy", "fleet-matrix.json")) as Array<{
  slug: string;
  profile_args: string;
}>;

describe("B542 · LiveKit RU-кластер", () => {
  it("livekit и redis спрятаны за отдельными профилями (opt-in по нодам)", () => {
    expect(overlay).toMatch(/livekit-redis:[\s\S]*?profiles:\s*\["livekit-redis"\]/);
    expect(overlay).toMatch(/\n {2}livekit:[\s\S]*?profiles:\s*\["livekit"\]/);
  });

  it("redis требует явный WG-bind — хосты флита без файрвола, публичный листен запрещён", () => {
    expect(overlay).toContain('"127.0.0.1"');
    expect(overlay).toMatch(/LIVEKIT_REDIS_BIND_IP:\?/);
  });

  it("обе RU-ноды несут livekit, redis — ровно на primary (eterapy-1)", () => {
    const bySlug = Object.fromEntries(matrix.map((vm) => [vm.slug, vm.profile_args]));
    for (const slug of ["eterapy-1", "eterapy-2"]) {
      expect(bySlug[slug]).toContain("-f docker-compose.livekit.yml");
      expect(bySlug[slug]).toContain("--profile livekit");
    }
    const redisNodes = matrix.filter((vm) => vm.profile_args.includes("--profile livekit-redis"));
    expect(redisNodes.map((vm) => vm.slug)).toEqual(["eterapy-1"]);
  });

  it("Foreign-ноды кластер не получают, пока нет AWS-доступов и своего Redis", () => {
    for (const slug of ["eterapy-3", "eterapy-4"]) {
      const vm = matrix.find((entry) => entry.slug === slug);
      expect(vm?.profile_args ?? "").not.toContain("livekit");
    }
  });

  it("деплой доставляет overlay на ноды (иначе -f в матрице бьёт по отсутствующему файлу)", () => {
    expect(workflow).toContain("deploy/compose/docker-compose.livekit.yml");
    expect(workflow).toContain("/opt/eterapy/docker-compose.livekit.yml");
  });

  it("сигналинг за HAProxy: loopback-фронтенд + обе ноды с health-check", () => {
    expect(haproxy).toContain("bind 127.0.0.1:${LB_LIVEKIT_PORT}");
    expect(haproxy).toMatch(/backend livekit_nodes[\s\S]*?server node-a \$\{LB_LIVEKIT_NODE_A\}[\s\S]*?server node-b \$\{LB_LIVEKIT_NODE_B\}/);
    expect(haproxy).toMatch(/backend livekit_nodes[\s\S]*?http-check expect status 200/);
    expect(lbCompose).toMatch(/LB_LIVEKIT_NODE_A:\s*\$\{LB_LIVEKIT_NODE_A:\?/);
    expect(lbCompose).toMatch(/LB_LIVEKIT_NODE_B:\s*\$\{LB_LIVEKIT_NODE_B:\?/);
  });

  it("шаблон конфига кластерный и без дефолтного ключа (INC-067)", () => {
    expect(example).toMatch(/\nredis:\n\s+address:/);
    // Упоминание в комментарии допустимо; devkey как реальный ключ — нет.
    expect(example).not.toMatch(/^\s*devkey\s*:/m);
    expect(example).toContain("use_external_ip: true");
  });
});
