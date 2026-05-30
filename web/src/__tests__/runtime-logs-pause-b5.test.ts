import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "src/app/admin/logs/logs-viewer.tsx"), "utf8");

describe("B5 — runtime logs pause while reading an expanded entry", () => {
  it("freezes snapshot updates when a log row is expanded", () => {
    expect(source).toContain("const pausedRef = useRef(false)");
    expect(source).toContain("pausedRef.current = expandedId !== null");
    // both the SSE push and the poll respect the pause
    expect(source).toContain("if (pausedRef.current) return; // B5: don't overwrite");
    expect(source).toContain("if (pausedRef.current) return; // B5: paused while a log is expanded");
    expect(source).toContain("пауза · читаете лог");
  });
});
