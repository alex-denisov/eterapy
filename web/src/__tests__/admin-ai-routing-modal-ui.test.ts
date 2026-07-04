import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "src/app/admin/ai/ai-control-center.tsx"), "utf8");

describe("admin AI routing modal UI", () => {
  it("uses icon-only routing actions and a viewport-safe scrollable modal", () => {
    expect(source).toContain("Pencil");
    expect(source).toContain('title="Изменить цепочку маршрутизации"');
    expect(source).toContain("<Pencil");
    expect(source).not.toContain(">\n          Изменить\n        </button>");
    expect(source).toContain("max-h-[calc(100vh-48px)]");
    expect(source).toContain("overflow-y-auto");
  });
});
