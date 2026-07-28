import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), "..", path), "utf8");

describe("PRB-009 · production network surface", () => {
  it("documents provider controls and the intentional RackNerd boundary", () => {
    const perimeter = read("deploy/SECURITY-PERIMETER.md");

    expect(perimeter).toContain("cloud.ru");
    expect(perimeter).toContain("EC2 Security Group");
    expect(perimeter).toContain("RackNerd");
    expect(perimeter).toContain("127.0.0.1:3200");
    for (const port of ["5432", "3200", "6379", "7880"]) {
      expect(perimeter).toContain(`${port}/tcp`);
    }
  });

  it("gates every production deploy on externally closed service ports", () => {
    const workflow = read(".github/workflows/deploy.yml");

    expect(workflow).toContain("Reject an unexpected public service port");
    expect(workflow).toContain('restricted_ports=("5432" "3200" "6379" "7880")');
    expect(workflow).toContain("/dev/tcp/${host}/${port}");
    expect(workflow).toContain("unexpected public listener");
  });
});
