import fs from "node:fs";
import path from "node:path";
import { externalPublicationInputSchema } from "@/lib/external-publications";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("B577 — external publication registry", () => {
  it("requires a public URL before a record can be published", () => {
    const result = externalPublicationInputSchema.safeParse({
      key: "vk-first-post",
      platform: "VK",
      title: "Первый полезный пост сообщества",
      contentType: "POST",
      status: "PUBLISHED",
      indexStatus: "UNKNOWN",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a planned record without inventing unavailable metrics", () => {
    const result = externalPublicationInputSchema.safeParse({
      key: "vk-first-post",
      platform: "VK",
      title: "Первый полезный пост сообщества",
      contentType: "POST",
      status: "PLANNED",
      indexStatus: "UNKNOWN",
    });
    expect(result.success).toBe(true);
  });

  it("keeps read and mutation surfaces SUPERADMIN-only and audited", () => {
    const page = source("src/app/admin/marketing/publications/page.tsx");
    const actions = source("src/app/admin/marketing/publications/actions.ts");
    const nav = source("src/app/admin/admin-shell.tsx");
    expect(page).toContain('data-testid="admin-external-publications-page"');
    expect(page).toContain('session.user.role !== "SUPERADMIN"');
    expect(actions).toContain('session.user.role !== "SUPERADMIN"');
    expect(actions).toContain("tx.auditLog.create");
    expect(actions).toContain("externalPublicationInputSchema.parse");
    expect(nav).toContain('adminUrl("/admin/marketing/publications")');
  });

  it("provides an idempotent code path and seeds verified Dzen URLs", () => {
    const adapter = source("src/lib/external-publications.ts");
    const migration = source("prisma/migrations/20260723120000_b577_external_publications/migration.sql");
    const packageJson = source("package.json");
    expect(adapter).toContain("externalPublication.upsert");
    expect(packageJson).toContain("marketing:register-publication");
    expect(migration).toContain("https://dzen.ru/a/amFfUQYIc3XurjAe");
    expect(migration).toContain("https://dzen.ru/a/amFsdDtvbj9IuMa9");
  });
});
