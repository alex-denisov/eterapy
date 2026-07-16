import { readFileSync } from "fs";
import { join } from "path";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * B346 / Интерфейс 8-9 — демо-практики переносятся в БД: на фронте больше нет
 * захардкоженных «демонстрационных» карточек и страниц «v4», каждая карточка
 * ведёт на реальную DB-страницу практика.
 */
describe("B346 — practitioner surfaces are purely DB-backed", () => {
  it("detail page 404s for unknown slugs instead of rendering a demo card", () => {
    const page = source("src/app/practitioners/[slug]/page.tsx");
    expect(page).toContain("if (!p) notFound()");
    expect(page).not.toContain("FallbackPractitionerPage");
    expect(page).not.toContain("FALLBACK_PROFILES");
    // No user-visible demo / v4 strings remain.
    expect(page).not.toContain("v4 профиль");
    expect(page).not.toContain("демонстрационная карточка");
  });

  it("catalog returns only DB practitioners (no hardcoded personas)", () => {
    const page = source("src/app/practitioners/page.tsx");
    expect(page).not.toContain("FALLBACK_PRACTITIONERS");
    expect(page).not.toContain("taya-berg");
    expect(page).not.toContain("sofia-mirnaya");
    // B484 re-orders the DB-backed list (reliability deprioritization) but adds
    // no hardcoded personas — the source rows still come only from `mapped`.
    expect(page).toContain("partitionByReliability(mapped, deprioritized)");
  });

  it("landing teaser hides itself instead of showing fictional specialists", () => {
    const teaser = source("src/components/landing/specialists-teaser.tsx");
    expect(teaser).not.toContain("FALLBACK_SPECIALISTS");
    expect(teaser).not.toContain("sofia-mirnaya");
    expect(teaser).toContain("if (specialists.length === 0) return null;");
  });
});
