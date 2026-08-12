/**
 * B709 — деавторизация Instagram обрабатывается так же, как у Threads.
 *
 * Асимметрия, найденная владельцем 2026-08-13: у Threads маршрут
 * `/deauthorize` был, у Instagram — нет. Тест держит оба маршрута рядом:
 * появление одного без другого — это молчаливая потеря сигнала о разрыве
 * связи, а узнаём мы о нём тогда только по неудачному выпуску.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTES = join(__dirname, "..", "app", "api", "integrations", "meta");

const platforms = [
  { platform: "Instagram", dir: "instagram" },
  { platform: "Threads", dir: "threads" },
] as const;

describe("B709 — деавторизация есть у обеих площадок Meta", () => {
  it.each(platforms)("$platform: маршрут /deauthorize существует", ({ dir }) => {
    expect(existsSync(join(ROUTES, dir, "deauthorize", "route.ts"))).toBe(true);
  });

  it.each(platforms)("$platform: подпись проверяется своей площадкой", ({ platform, dir }) => {
    const source = readFileSync(join(ROUTES, dir, "deauthorize", "route.ts"), "utf8");
    // Перепутанная площадка в проверке подписи означала бы, что чужой
    // signed_request отключает не тот коннектор.
    expect(source).toContain(`verifyMetaSignedRequest("${platform}"`);
    expect(source).toContain(`disconnectMetaPlatform("${platform}")`);
  });

  it.each(platforms)("$platform: без подписи маршрут не отключает ничего", ({ dir }) => {
    const source = readFileSync(join(ROUTES, dir, "deauthorize", "route.ts"), "utf8");
    expect(source).toContain("Missing signed_request");
    expect(source).toContain("Invalid signature");
    expect(source).toContain("status: 403");
  });

  it("удаление данных обслуживает обе площадки одним адресом", () => {
    // Meta зовёт его для любого приложения, а разбирает подпись он сам.
    const source = readFileSync(join(ROUTES, "data-deletion", "route.ts"), "utf8");
    expect(source).toContain('verifyMetaSignedRequest("Instagram"');
    expect(source).toContain('verifyMetaSignedRequest("Threads"');
    expect(source).toContain("confirmation_code");
  });
});
