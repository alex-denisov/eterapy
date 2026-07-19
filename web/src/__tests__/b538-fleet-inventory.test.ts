import fs from "node:fs";
import path from "node:path";

/**
 * B538 — deploy/fleet-matrix.json = единственный источник истины о флите:
 * его читают деплой-matrix (deploy.yml) и панель мониторинга (B541).
 * Битая запись = молча выпавшая из деплоя нода, поэтому схема стережётся CI.
 */
const repoRoot = path.resolve(process.cwd(), "..");
const matrix = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "deploy", "fleet-matrix.json"), "utf8"),
) as Array<Record<string, unknown>>;

describe("B538 · инвентарь флита", () => {
  it("каждая нода объявляет полный набор полей", () => {
    for (const vm of matrix) {
      expect(typeof vm.name).toBe("string");
      expect(String(vm.slug)).toMatch(/^[a-z0-9-]+$/);
      expect(String(vm.host)).toMatch(/^\d{1,3}(\.\d{1,3}){3}$/);
      expect(typeof vm.user).toBe("string");
      expect(typeof vm.profile_args).toBe("string");
      expect(typeof vm.standby).toBe("boolean");
    }
  });

  it("slug'и уникальны — по ним адресуются редеплой и health", () => {
    const slugs = matrix.map((vm) => vm.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("каждый compose-файл ноды существует в deploy/compose/", () => {
    for (const vm of matrix) {
      const file = path.join(repoRoot, "deploy", "compose", String(vm.compose));
      expect(fs.existsSync(file)).toBe(true);
    }
  });

  it("runbook добавления ВМ существует и ссылается на инвентарь", () => {
    const readme = fs.readFileSync(
      path.join(repoRoot, "deploy", "provisioning", "README.md"),
      "utf8",
    );
    expect(readme).toContain("fleet-matrix.json");
    expect(readme).toContain("bootstrap.sh");
  });
});
