import fs from "node:fs";
import path from "node:path";

const publicDir = path.join(process.cwd(), "public");

function publicPath(assetPath: string) {
  return path.join(publicDir, assetPath.replace(/^\//, ""));
}

describe("design v4 brand assets", () => {
  it("uses the scalable v4 halo as the only active favicon source", () => {
    const layout = fs.readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
    const icon = fs.readFileSync(publicPath("/icon.svg"), "utf8");
    const manifest = JSON.parse(fs.readFileSync(publicPath("/site.webmanifest"), "utf8"));

    expect(layout).toContain('url: "/icon.svg"');
    expect(layout).toContain('manifest: "/site.webmanifest"');
    expect(layout).not.toContain("brandAssets");
    expect(icon).toContain("#FBF6EE");
    expect(icon).toContain("#D67558");
    expect(icon).toContain("#A89BC9");
    expect(fs.existsSync(publicPath("/favicon.ico"))).toBe(true);
    expect(manifest.icons).toEqual([
      expect.objectContaining({ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }),
    ]);
  });

  it("removes old Brandbook logo and favicon directories from the active public bundle", () => {
    expect(fs.existsSync(path.join(publicDir, "brand/logos"))).toBe(false);
    expect(fs.existsSync(path.join(publicDir, "brand/icons"))).toBe(false);
    expect(fs.existsSync(path.join(publicDir, "favicon"))).toBe(false);
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
  });
});
