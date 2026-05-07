import fs from "node:fs";
import path from "node:path";
import { brandAssets } from "@/lib/brand-assets";

const publicDir = path.join(process.cwd(), "public");

function publicPath(assetPath: string) {
  return path.join(publicDir, assetPath.replace(/^\//, ""));
}

describe("brand production assets", () => {
  it("points only to copied public assets", () => {
    const allAssetPaths = [
      ...Object.values(brandAssets.logos),
      ...Object.values(brandAssets.icons),
      ...Object.values(brandAssets.favicon),
      ...Object.values(brandAssets.tokens),
    ];

    expect(allAssetPaths.length).toBeGreaterThan(10);
    for (const assetPath of allAssetPaths) {
      expect(assetPath).toMatch(/^\/(?:brand|favicon)\//);
      expect(fs.existsSync(publicPath(assetPath))).toBe(true);
    }
  });

  it("uses the final production favicon manifest", () => {
    const manifest = JSON.parse(fs.readFileSync(publicPath(brandAssets.favicon.manifest), "utf8"));

    expect(manifest).toEqual(expect.objectContaining({
      name: "ETerapy",
      short_name: "ETerapy",
      theme_color: "#FBF6EE",
      background_color: "#FBF6EE",
      display: "standalone",
    }));
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/favicon/favicon_192x192.png", sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ src: "/favicon/favicon_512x512.png", sizes: "512x512", type: "image/png" }),
    ]));
  });

  it("keeps old starter and pre-v5 public assets out of the active bundle", () => {
    const removedLegacyAssets = [
      "logo.svg",
      "next.svg",
      "vercel.svg",
      "file.svg",
      "globe.svg",
      "window.svg",
      "favicon.svg",
      "favicon.png",
    ];

    for (const assetName of removedLegacyAssets) {
      expect(fs.existsSync(path.join(publicDir, assetName))).toBe(false);
    }

    expect(fs.readFileSync(publicPath(brandAssets.favicon.ico))).toEqual(
      fs.readFileSync(path.join(publicDir, "favicon.ico")),
    );
  });
});
