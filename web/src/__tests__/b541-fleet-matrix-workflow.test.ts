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
});
