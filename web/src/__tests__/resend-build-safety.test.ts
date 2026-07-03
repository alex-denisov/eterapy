import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Resend build safety", () => {
  it("does not instantiate Resend at module import time", () => {
    const files = [
      "src/lib/email.ts",
      "src/app/api/practitioners/apply/route.ts",
      "src/app/api/complaints/route.ts",
    ];

    for (const file of files) {
      const text = source(file);
      expect(text).not.toContain("const resend = new Resend(process.env.RESEND_API_KEY)");
      expect(text).not.toContain("new Resend(process.env.RESEND_API_KEY);");
    }
  });
});
