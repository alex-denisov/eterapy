import fs from "node:fs";
import path from "node:path";

describe("B615 — landing header navigation stays on one line", () => {
  it("makes every ordinary desktop navigation item non-wrapping and shrink-proof", () => {
    const header = fs.readFileSync(
      path.join(process.cwd(), "src/components/header.tsx"),
      "utf8",
    );
    expect(header).toContain("flex-nowrap");
    expect(header).toContain("shrink-0 whitespace-nowrap");
  });
});
