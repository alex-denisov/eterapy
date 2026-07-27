/**
 * INC-080 — все публичные страницы отдавали `no-store`, потому что корневое
 * дерево читало куки. В prerender-манифесте прода лежало 14 адресов вместо
 * двух с лишним сотен.
 *
 * Причин было три, и каждая — «остаток», а не решение:
 *   1. `ImpersonationBanner` — серверный, звал `auth()` из корневого layout;
 *   2. `await auth()` на Главной без присваивания — хвост убранного редиректа;
 *   3. `force-dynamic` на прайсе — хвост убранного похода в базу;
 *   4. `searchParams` в `/library` ради фильтра по теме.
 *
 * СТОРОЖ. Проверять текст файлов здесь уместнее, чем гонять сборку: любой из
 * четырёх остатков вернётся одной строкой, и вернётся молча — сайт продолжит
 * работать, просто перестанет кешироваться. Настоящая сборка это ловит, но
 * узнаёшь об этом через неделю на проде.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Читаем БЕЗ комментариев: объяснения к этому же фиксу называют запрещённые
 * конструкции по имени, и сторож ловил бы собственный текст вместо кода.
 */
const read = (relativePath: string) =>
  fs
    .readFileSync(path.join(process.cwd(), relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("INC-080 · публичное дерево остаётся собираемым заранее", () => {
  it("корневой layout не читает куки и не зовёт auth()", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).not.toContain("cookies()");
    expect(layout).not.toContain("await auth()");
  });

  it("плашка имперсонации — клиентская", () => {
    const banner = read("src/components/impersonation-banner.tsx");
    expect(banner.startsWith('"use client"')).toBe(true);
    expect(banner).not.toContain('from "@/lib/auth"');
  });

  it("Главная не зовёт auth() ради выброшенного результата", () => {
    const home = read("src/app/page.tsx");
    expect(home).not.toContain("await auth()");
    expect(home).not.toContain('from "@/lib/auth"');
  });

  it("прайс не помечен force-dynamic", () => {
    expect(read("src/app/pricing/page.tsx")).not.toContain('dynamic = "force-dynamic"');
  });

  it("библиотека не принимает searchParams — фильтр темы живёт на клиенте", () => {
    expect(read("src/app/library/page.tsx")).not.toContain("searchParams");
    expect(read("src/components/library/library-search.tsx")).toContain("window.location.search");
  });

  it("клиентский фильтр НЕ уводит список в клиентский рендер через useSearchParams", () => {
    // Хук в статическом маршруте выкинул бы карточки из готового HTML, то есть
    // из выдачи. Ради этого и читаем адрес вручную после гидрации.
    expect(read("src/components/library/library-search.tsx")).not.toContain("useSearchParams");
  });
});

/**
 * Пятая причина жила не в приложении, а в балансировщике: вставленная cookie
 * привязки к ноде тянет за собой `Cache-Control: private`, и заранее собранный
 * HTML всё равно нельзя положить в общий кеш. Публичный трафик разведён на пул
 * без cookie — сторож следит, чтобы разведение не схлопнулось обратно.
 */
describe("INC-080 · балансировщик не клеит cookie на публичные ответы", () => {
  const cfg = fs.readFileSync(
    path.join(process.cwd(), "..", "deploy", "lb", "haproxy.cfg"),
    "utf8",
  );
  const backend = (name: string) => {
    const body = cfg.split(new RegExp(`^backend ${name}$`, "m"))[1] ?? "";
    return body.split(/^(?:backend|frontend|listen) /m)[0];
  };

  it("публичный пул существует и НЕ вставляет cookie", () => {
    const publicBackend = backend("app_nodes_public");
    expect(publicBackend).toContain("server node-a");
    expect(publicBackend).not.toContain("cookie");
  });

  it("аутентифицированный пул cookie по-прежнему вставляет", () => {
    expect(backend("app_nodes")).toContain("cookie SRVID insert indirect nocache");
  });

  it("на публичный пул уходят только GET/HEAD вне кабинета, админки и API", () => {
    expect(cfg).toContain("acl lb_path_private path_beg /api /cabinet /admin /login /register /rtc");
    expect(cfg).toContain(
      "use_backend app_nodes_public if lb_cacheable_method !lb_host_app !lb_host_admin !lb_path_private",
    );
  });

  it("здоровье публичного пула трекается у основного, а не считается заново", () => {
    expect(backend("app_nodes_public")).toContain("track app_nodes/node-a");
  });
});
