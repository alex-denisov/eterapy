import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B048 marketplace-first cleanup", () => {
  it("makes the public practitioners page a secondary post-context surface", () => {
    const page = source("src/app/practitioners/page.tsx");
    const grid = source("src/app/practitioners/practitioners-grid.tsx");

    // v4 redesign: hero no longer has duplicate CTA buttons — the post-context CTA lives in the grid
    expect(page).toContain("проверенные специалисты");
    expect(page).toContain("мы доверяем сами");
    expect(grid).toContain('href="/checkin"');
    expect(page).not.toContain("Каталог практиков");
    expect(page).not.toContain("PractitionersCatalog");
  });

  it("removes the old public practitioners catalog client", () => {
    expect(fs.existsSync(path.join(root, "src/app/practitioners/catalog-client.tsx"))).toBe(false);
  });

  it("turns the all-modalities index into a redirect to the canonical checkin route", () => {
    const page = source("src/app/all-modalities/page.tsx");

    expect(page).toContain('redirect("/checkin")');
    expect(page).not.toContain("3 бесплатных расклада");
    expect(page).not.toContain("Направления самопознания");
  });

  it("keeps public support CTAs out of the catalog-first path", () => {
    const notFound = source("src/app/not-found.tsx");
    const about = source("src/app/about/page.tsx");
    const chooser = source("src/app/how-to-choose/page.tsx");
    const help = source("src/app/help/page.tsx");

    expect(notFound).toContain('href="/checkin"');
    expect(about).toContain('href="/checkin"');
    expect(chooser).toContain("Начать разбор");
    expect(help).toContain("Для записи к практику перейдите");
    expect(help).not.toContain("Для записи к практику в v5");
    expect(`${notFound}\n${about}\n${chooser}\n${help}`).not.toContain("Перейдите в каталог практиков");
    expect(`${notFound}\n${about}\n${chooser}`).not.toContain("Найти практика в каталоге");
  });
});
