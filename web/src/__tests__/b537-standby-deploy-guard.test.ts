import fs from "node:fs";
import path from "node:path";

/**
 * B537 — eterapy-2 держит read-only PG-реплику eterapy-1. Деплой обязан
 * обходить на таком узле две вещи, иначе нода краснеет на первом же мерже
 * в main: `prisma migrate deploy` (пишет в БД) и worker (пишет job на каждом
 * тике). Тесты стерегут именно этот контракт — руками его легко потерять
 * при следующей правке compose/матрицы.
 */
const repoRoot = path.resolve(process.cwd(), "..");
const matrix = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "deploy", "fleet-matrix.json"), "utf8"),
) as Array<Record<string, unknown>>;
const compose = fs.readFileSync(
  path.join(repoRoot, "deploy", "compose", "docker-compose.yml"),
  "utf8",
);
const workflow = fs.readFileSync(
  path.join(repoRoot, ".github", "workflows", "deploy.yml"),
  "utf8",
);

describe("B537 · standby-узел переживает деплой", () => {
  it("каждая нода объявляет роль standby явным булевым флагом", () => {
    for (const vm of matrix) {
      expect(typeof vm.standby).toBe("boolean");
    }
  });

  it("ровно один RU-узел помечен standby (eterapy-2)", () => {
    const standby = matrix.filter((vm) => vm.standby === true).map((vm) => vm.slug);
    expect(standby).toEqual(["eterapy-2"]);
  });

  it("standby не получает worker-профиль, пишущие узлы получают", () => {
    for (const vm of matrix) {
      if (vm.standby === true) {
        expect(vm.profile_args).toBe("");
      } else {
        expect(String(vm.profile_args)).toContain("--profile worker");
      }
    }
  });

  it("worker спрятан за профилем, иначе он стартует на реплике и крэш-лупит", () => {
    expect(compose).toMatch(/worker:[\s\S]*?profiles:\s*\["worker"\]/);
  });

  it("migrate пропускает миграции при FLEET_NODE_STANDBY=1 и выходит нулём", () => {
    // exit 0 обязателен: web ждёт migrate через service_completed_successfully.
    expect(compose).toContain('if [ "${FLEET_NODE_STANDBY:-0}" = "1" ]');
    expect(compose).toMatch(/FLEET_NODE_STANDBY[\s\S]*?exit 0/);
  });

  it("деплой проставляет роль узла в .env через env, а не интерполяцией в shell", () => {
    expect(workflow).toContain("NODE_STANDBY:");
    expect(workflow).toContain("FLEET_NODE_STANDBY=$NODE_STANDBY");
    expect(workflow).not.toMatch(/FLEET_NODE_STANDBY=\$\{\{/);
  });

  it("проверка worker health не валит деплой на standby", () => {
    // Первый прод-выкат B537 упал именно здесь: compose-профиль worker'а не
    // поднимал, а шаг верификации требовал «running» безусловно.
    expect(workflow).toMatch(/worker health[\s\S]{0,400}NODE_STANDBY.*=.*"1"/);
    const check = workflow.slice(workflow.indexOf("▶ worker health"));
    const guardIdx = check.indexOf("NODE_STANDBY");
    const inspectIdx = check.indexOf("docker inspect -f '{{.State.Status}}' eterapy-worker-1");
    expect(guardIdx).toBeGreaterThanOrEqual(0);
    expect(inspectIdx).toBeGreaterThan(guardIdx); // гейт стоит ДО проверки
  });

  it("проверка существующего ключа в .env идёт под sudo (иначе плодятся дубли)", () => {
    // /opt/eterapy/.env читается только root'ом: беспривилегированный grep
    // всегда падал и каждый деплой дописывал ключ заново (найдено на eterapy-2).
    const probes = workflow.match(/\S*\s*grep -q '\^\$key='/g) ?? [];
    expect(probes.length).toBeGreaterThan(0);
    for (const probe of probes) {
      expect(probe).toContain("sudo grep");
    }
  });
});
