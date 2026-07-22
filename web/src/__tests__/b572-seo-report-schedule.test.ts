/**
 * B572 — SEO-отчёт уехал с расписания GitHub Actions на systemd-таймер ноды.
 *
 * Владелец 2026-07-22: «Сегодня не было отчёта по SEO ещё, хотя вроде должен
 * был быть в 9 утра». Расписание жило в `schedule:` GitHub Actions, а он
 * выполняет его как получится: почасовой sync-staging-db в этом же репозитории
 * за сутки отработал 12 раз из 25, с опозданиями до 1ч55м.
 *
 * Тест держит три вещи, которые легко расклеить порознь: расписания в workflow
 * больше нет, таймер поднимается ровно на одной ноде, и путь к скрипту в
 * unit-файле совпадает с тем, куда его кладёт выкатка.
 */
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "..");
const read = (...p: string[]) => fs.readFileSync(path.join(repoRoot, ...p), "utf8");

const workflow = read(".github", "workflows", "seo-report.yml");
const deployWorkflow = read(".github", "workflows", "deploy.yml");
const timer = read("deploy", "seo", "eterapy-seo-report.timer");
const service = read("deploy", "seo", "eterapy-seo-report.service");
const script = read("deploy", "seo", "seo-telegram-report.sh");

describe("B572 · SEO-отчёт", () => {
  it("workflow больше не держит расписание — только ручной запуск", () => {
    expect(workflow).not.toContain("schedule:");
    expect(workflow).not.toContain("cron:");
    expect(workflow).toContain("workflow_dispatch");
  });

  it("таймер — ежедневно в 09:00 и переживает выключенную ноду", () => {
    expect(timer).toContain("OnCalendar=*-*-* 09:00:00");
    // Учение B537 гасило прод целиком: без Persistent пропущенный день молча теряется.
    expect(timer).toContain("Persistent=true");
  });

  it("Restart= не проставлен: systemd не грузит oneshot с рестартом", () => {
    expect(service).toContain("Type=oneshot");
    expect(service).not.toMatch(/^Restart=(?!no$)/m);
  });

  it("unit зовёт ровно тот путь, по которому выкатка кладёт скрипт", () => {
    expect(service).toContain("ExecStart=/opt/eterapy/seo-telegram-report.sh");
    expect(deployWorkflow).toContain("/opt/eterapy/seo-telegram-report.sh");
    expect(deployWorkflow).toContain("deploy/seo/seo-telegram-report.sh");
  });

  it("таймер включается только на primary — иначе отчётов столько же, сколько нод", () => {
    expect(deployWorkflow).toContain("NODE_ROLE");
    expect(deployWorkflow).toMatch(
      /if \[ "\$NODE_ROLE" = "primary" \][\s\S]*?enable --now eterapy-seo-report\.timer/,
    );
    expect(deployWorkflow).toMatch(/else[\s\S]*?disable --now eterapy-seo-report\.timer/);
  });

  it("креды читаются из .env ноды, но файл не исполняется", () => {
    expect(script).toContain("ETERAPY_ENV_FILE");
    expect(script).toContain("TELEGRAM_BOT_TOKEN");
    // source/eval на .env — это выполнение файла с паролями.
    expect(script).not.toMatch(/^\s*(source|\.)\s+"\$ENV_FILE"/m);
    expect(script).not.toMatch(/eval .*ENV_FILE/);
  });

  it("выкатка доставляет на ноду секреты, без которых отчёт не соберётся", () => {
    for (const key of [
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_CHAT_ID",
      "YANDEX_OAUTH_TOKEN",
      "YANDEX_WORDSTAT_API_KEY",
      "YANDEX_CLOUD_FOLDER_ID",
    ]) {
      // Секрет, не попавший в ЦИКЛ доставки, равен несуществующему (готча B570).
      expect(deployWorkflow).toMatch(new RegExp(`for key in[\\s\\S]*?${key}[\\s\\S]*?; do`));
    }
  });
});
