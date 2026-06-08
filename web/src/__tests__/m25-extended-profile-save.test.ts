import { readFileSync } from "fs";
import { join } from "path";
import { formatDateForServer } from "@/lib/date-utils";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * M25 — Механика 3: the extended-profile save silently failed because the client
 * sends "YYYY-MM-DD" but the API parsed "ДД.ММ.ГГГГ" (split "."), producing an
 * Invalid Date that crashed the whole update.
 */
describe("M25 extended profile save (Механика 3)", () => {
  it("client serializer emits YYYY-MM-DD (the format the API must accept)", () => {
    expect(formatDateForServer("03.03.1988")).toBe("1988-03-03");
  });

  it("API parses the YYYY-MM-DD the client sends, not split('.')", () => {
    const route = source("src/app/api/auth/extended-profile/route.ts");
    expect(route).toMatch(/\(\\d\{4\}\)-\(\\d\{2\}\)-\(\\d\{2\}\)/);
    expect(route).not.toContain('birthDate.split(".")');
    // never persist an Invalid Date, and never 500 silently
    expect(route).toContain("Number.isNaN(parsed.getTime())");
  });

  it("save handler resets the saving flag in finally (no stuck 'Сохранение…')", () => {
    const client = source("src/app/cabinet/settings/settings-client.tsx");
    expect(client).toMatch(/finally\s*\{\s*setSaving\(false\);\s*\}/);
  });
});
