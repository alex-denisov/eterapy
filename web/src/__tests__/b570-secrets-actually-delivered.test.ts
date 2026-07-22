import fs from "node:fs";
import path from "node:path";

/**
 * B570 — секрет, который заведён, но не доставлен, равен несуществующему.
 *
 * Так уже случалось дважды. B554 завёл `MINIAPP_TELEGRAM_ALLOWLIST`, значение
 * полагалось вписать на хост руками — оно туда не доехало, и стенд полторы
 * недели стоял открытым в копию боевой базы. B570 повторил ошибку на другом
 * витке: секрет `ROBOKASSA_TEST_EMAILS` завели в репозитории, но забыли внести
 * в цикл доставки `deploy.yml` — на проде переменная приехала пустой. Поймано
 * живой проверкой `.env` после выкатки, а не тестом.
 *
 * (Сам список почт с тех пор заменён признаком у пользователя — B571. Урок
 * остался: секрет, не попавший в цикл доставки, равен несуществующему.)
 *
 * Тест смотрит на КОД: какие платёжные и флотские ключи читает приложение — и
 * требует, чтобы каждый из них упоминался в цикле доставки. Забыть ключ теперь
 * можно только вместе с падающим тестом.
 */
const repoRoot = path.resolve(process.cwd(), "..");
const deployWorkflow = fs.readFileSync(
  path.join(repoRoot, ".github", "workflows", "deploy.yml"),
  "utf8",
);

/**
 * Ключи, которые приложение читает из окружения и которые ОБЯЗАНЫ приезжать
 * выкаткой.
 *
 * Ловится ДВА написания. Кроме `process.env.KEY` есть ещё имя строкой —
 * `requireEnv("ROBOKASSA_PASSWORD_1")`, `present(isTest ? "A" : "B")`. Первая
 * версия теста смотрела только на `process.env.` и пропускала как раз пароли,
 * то есть самые важные ключи.
 */
function envKeysReadBy(relativePath: string): string[] {
  const source = fs.readFileSync(path.join(repoRoot, "web", relativePath), "utf8");
  const found = new Set<string>();
  const interesting = /^(ROBOKASSA_|CLOUDFLARE_|PAYMENT_PROVIDER$|FLEET_NODES$)/;

  for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) {
    if (interesting.test(match[1])) found.add(match[1]);
  }
  for (const match of source.matchAll(/["']([A-Z][A-Z0-9_]{3,})["']/g)) {
    if (interesting.test(match[1])) found.add(match[1]);
  }
  return [...found].sort();
}

describe("B570 — каждый платёжный и флотский ключ доезжает выкаткой", () => {
  const sources = [
    "src/lib/payments/config.ts",
    "src/lib/fleet/cloudflare.ts",
    "src/lib/fleet/nodes.ts",
  ];

  it("в исходниках вообще нашлись такие ключи (иначе тест бессмысленен)", () => {
    const all = sources.flatMap(envKeysReadBy);
    expect(all.length).toBeGreaterThan(5);
    expect(all).toContain("ROBOKASSA_PASSWORD_1");
    expect(all).toContain("CLOUDFLARE_API_TOKEN");
  });

  it.each(sources)("%s — все ключи упомянуты в deploy.yml", (source) => {
    for (const key of envKeysReadBy(source)) {
      // ROBOKASSA_TAX_SYSTEM имеет безопасное умолчание в коде (usn_income) и
      // намеренно не доставляется — остальные обязаны быть в выкатке.
      if (key === "ROBOKASSA_TAX_SYSTEM") continue;
      expect(deployWorkflow).toContain(key);
    }
  });

  it("ключи с секретами перечислены в цикле доставки, а не только в env-блоке", () => {
    // Цикл `for key in …` — это то, что реально пишет значение в /opt/eterapy/.env.
    // Попасть в env-блок и не попасть в цикл — ровно тот промах, что случился.
    const loop = deployWorkflow.match(/for key in ([\s\S]*?); do/);
    expect(loop).not.toBeNull();
    const delivered = loop![1];
    for (const key of [
      "ROBOKASSA_MERCHANT_LOGIN",
      "ROBOKASSA_PASSWORD_1",
      "ROBOKASSA_PASSWORD_2",
      "ROBOKASSA_TEST_PASSWORD_1",
      "ROBOKASSA_TEST_PASSWORD_2",
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_API_TOKEN",
    ]) {
      expect(delivered).toContain(key);
    }
  });
});
