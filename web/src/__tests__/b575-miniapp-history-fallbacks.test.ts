import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const source = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("B575 · Mini App history and honest fallback contract", () => {
  it("uses a debounced server search and cursor pagination, not a first-page filter", () => {
    const screen = source("components/miniapp/screens/dialogues-screen.tsx");
    expect(screen).toContain('params.set("q", options.query)');
    expect(screen).toContain('params.set("cursor", options.cursor)');
    expect(screen).toContain("window.setTimeout");
    expect(screen).toContain("Показать ещё");
    expect(screen).not.toContain("data.dialogues.filter");
  });

  it("never presents unknown account data as zero balance or a basic plan", () => {
    const shell = source("components/miniapp/miniapp-shell.tsx");
    const wallet = source("components/miniapp/wallet-screen.tsx");
    const profile = source("components/miniapp/screens/profile-screen.tsx");

    expect(shell).toContain('data.loadError ? "—" : data.viewer.points');
    expect(shell.toLocaleLowerCase("ru-RU")).toContain(
      "мы не показываем ноль или базовый тариф вместо неизвестных данных",
    );
    expect(wallet).toContain("Баланс неизвестен — ноль здесь не означает, что баллов нет");
    expect(profile).toContain("Не удалось загрузить");
  });

  it("routes muted Mini App copy through the AA contrast token", () => {
    const css = source("app/miniapp/miniapp-v21.module.css");
    expect(css).toContain("--muted: #8f9bad");
    for (const legacy of ["#657286", "#667286", "#697589", "#6f7c8e", "#718095", "#718097", "#727f91", "#6f7e92"]) {
      expect(css.toLowerCase()).not.toContain(legacy);
    }
  });
});
