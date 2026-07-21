import fs from "node:fs";
import path from "node:path";
import { cspValue } from "@/lib/security-headers";

/**
 * B523 — разбор накопленной report-only телеметрии CSP (прод, 2026-07-21).
 *
 * Данные из логов обеих app-нод дали два разных класса нарушений:
 *
 * 1. `disposition: "report"`, `https://eterapy.com`, `script-src`/`script-src-elem`,
 *    `blocked-uri: inline` — это ОЖИДАЕМО: публичные страницы пререндерены, у них
 *    не может быть per-request nonce, поэтому в БОЕВОЙ политике там оставлен
 *    `'unsafe-inline'`, а report-only политика (она без него) фиксирует каждый
 *    инлайновый скрипт Next. Убирать `'unsafe-inline'` с публичных страниц по
 *    этим отчётам НЕЛЬЗЯ — сломается собственный бутстрап Next.
 *
 * 2. 🔴 `disposition: "enforce"`, `https://admin.eterapy.com` — а вот это была
 *    живая поломка, а не телеметрия: на админском поддомене nonce-политика
 *    ДЕЙСТВУЕТ, и два инлайновых сниппета аналитики (Метрика и GA) там
 *    блокировались по-настоящему. `<Script strategy="afterInteractive">`
 *    вставляется на клиенте после гидратации и серверный nonce не получает.
 *
 * Починка: в админке внешняя аналитика не поднимается вовсе.
 */
const analytics = fs.readFileSync(
  path.join(process.cwd(), "src/components/analytics.tsx"),
  "utf8",
);

describe("B523 — аналитика не ломится в nonce-политику админки", () => {
  it("аналитика отключена на админской поверхности", () => {
    expect(analytics).toContain("isAdminSurface");
    expect(analytics).toContain("ADMIN_DOMAIN");
  });

  it("проверка клиентская — корневой layout не читает заголовки", () => {
    // headers() в корневом layout сделал бы динамическими все пререндеренные
    // страницы; ради отключения аналитики в админке это неприемлемая цена.
    const layout = fs.readFileSync(path.join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).not.toContain("x-eterapy-csp-nonce");
  });
});

describe("B523 — политика осталась корректной", () => {
  it("nonce-политика идёт БЕЗ unsafe-inline", () => {
    const policy = cspValue({ production: true, nonce: "abc123" });
    expect(policy).toContain("'nonce-abc123'");
    expect(policy).not.toContain("'unsafe-inline' https://mc.yandex.ru");
    expect(policy.split("script-src ")[1]?.split(";")[0]).not.toContain("'unsafe-inline'");
  });

  it("публичные страницы сохраняют unsafe-inline — иначе ляжет бутстрап Next", () => {
    // Это осознанное решение, а не недосмотр: 340+ страниц пререндерены и
    // per-request nonce получить не могут. Снятие требует другого механизма
    // (хеши инлайн-скриптов), а не правки этой строки.
    const policy = cspValue({ production: true });
    expect(policy.split("script-src ")[1]?.split(";")[0]).toContain("'unsafe-inline'");
  });

  it("отчёты по-прежнему собираются в обеих политиках", () => {
    expect(cspValue({ production: true, reportOnly: true })).toContain("report-uri /api/csp-report");
    expect(cspValue({ production: true, nonce: "abc123" })).toContain("report-uri /api/csp-report");
  });
});
