import fs from "node:fs";
import path from "node:path";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("B506/B507 Maya astrology previews", () => {
  it("uses the supplied Maya wheel and planetary SVG families", () => {
    const assets = source("src/app/dev-preview/b506-b507-astrology/maya-assets.ts");
    expect(assets).toContain("/Users/alexeydenisov/Downloads/maya-1-ru");
    expect(assets).toContain("svgexport-${fileNumber}.svg");
    expect(assets).toContain("planet-container-natal");
    expect(assets).toContain("planet-container-design");
  });

  it("maps the saved natal and synastry placements into separate overlays", () => {
    const data = source("src/app/dev-preview/b506-b507-astrology/preview-data.ts");
    const wheel = source("src/app/dev-preview/b506-b507-astrology/maya-wheel.tsx");
    expect(data).toContain("336.4668");
    expect(data).toContain("230.0921");
    expect(data).toContain("98.4517");
    expect(wheel).toContain("MayaNatalWheel");
    expect(wheel).toContain("MayaSynastryWheel");
    expect(wheel).toContain("assets.partnerIcons");
    expect(wheel).toContain("layout.get(from.luminary)?.marker");
    expect(wheel).toContain("layoutA.get(from.luminary)?.marker");
    expect(wheel).toContain("layoutB.get(to.luminary)?.marker");
    expect(wheel).not.toContain('r="92" fill="#FFFDF7"');
    expect(wheel).not.toContain('r="82" fill="#FFFDF7"');
  });

  it("builds the horary preview from its own fixed moment", () => {
    const horary = source("src/app/dev-preview/b509-horary/page.tsx");
    expect(horary).toContain("buildNatalEphemerisWheel");
    expect(horary).toContain("computeHoraryFacts");
    expect(horary).not.toContain("NATAL_PREVIEW");
  });

  it("keeps previews local-only and exposes the house-method limitation", () => {
    const natal = source("src/app/dev-preview/b506-natal/page.tsx");
    const synastry = source("src/app/dev-preview/b507-synastry/page.tsx");
    expect(natal).toContain('process.env.NODE_ENV === "production"');
    expect(synastry).toContain('process.env.NODE_ENV === "production"');
    expect(natal).toContain("Equal House · точный градус ASC не сохранён");
  });
});
