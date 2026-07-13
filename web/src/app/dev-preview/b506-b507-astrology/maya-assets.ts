import "server-only";

import fs from "node:fs";
import path from "node:path";

const MAYA_DIR = "/Users/alexeydenisov/Downloads/maya-1-ru";

const PLANET_FILES: Record<string, number> = {
  sun: 17,
  moon: 19,
  mercury: 22,
  venus: 23,
  mars: 24,
  jupiter: 25,
  saturn: 26,
  uranus: 27,
  neptune: 28,
  pluto: 29,
};

const PARTNER_PLANET_FILES: Record<string, number> = {
  sun: 31,
  moon: 33,
  mercury: 36,
  venus: 37,
  mars: 38,
  jupiter: 39,
  saturn: 40,
  uranus: 41,
  neptune: 42,
  pluto: 43,
};

function svgDataUrl(fileNumber: number, injectedStyle?: string) {
  const filePath = path.join(MAYA_DIR, `svgexport-${fileNumber}.svg`);
  let svg = fs.readFileSync(filePath, "utf8");
  if (injectedStyle) {
    svg = svg.replace(/<svg\b[^>]*>/, (root) => `${root}<style>${injectedStyle}</style>`);
  }
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export type MayaAssetSet = {
  base: string;
  natalIcons: Record<string, string>;
  partnerIcons: Record<string, string>;
};

export function loadMayaAssets(): MayaAssetSet {
  const hiddenSourceLayers = [
    ".planet-container-natal",
    ".planet-container-design",
    ".aspect-container-natal",
    ".house-cusp-line",
    ".house-text",
  ].join(",");
  const base = svgDataUrl(1, `${hiddenSourceLayers}{display:none!important}`);
  const natalIcons = Object.fromEntries(
    Object.entries(PLANET_FILES).map(([key, file]) => [key, svgDataUrl(file)]),
  );
  const partnerIcons = Object.fromEntries(
    Object.entries(PARTNER_PLANET_FILES).map(([key, file]) => [key, svgDataUrl(file)]),
  );
  return { base, natalIcons, partnerIcons };
}
