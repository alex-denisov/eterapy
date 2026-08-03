/**
 * INC-095 — политика хранения релизных образов на нодах.
 *
 * Решение владельца 2026-08-03: прод хранит текущий образ и максимум два
 * предыдущих, стенд — только текущий. Проверяем не текст правила, а поведение
 * скрипта: подставляем поддельные `sudo docker` и `df` и смотрим, какие теги
 * он реально удаляет. Проверка «в workflow есть нужная строка» тут не годится
 * — ровно так и разъехались две inline-копии правила, из-за которых стенд
 * копил вытесненные образы на диске боевого Postgres.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SCRIPT = path.join(REPO_ROOT, "deploy/docker/retain-release-images.sh");

type Fixture = {
  /** теги образов репозитория, от нового к старому */
  images: string[];
  /** образ работающего контейнера, `null` — контейнера нет */
  running: string | null;
  /** свободные гигабайты; массив — значение меняется после каждого вызова df */
  freeGb: number | number[];
};

/**
 * Готовит песочницу с поддельными `sudo`, `docker` и `df` на PATH и запускает
 * скрипт. Возвращает удалённые образы и вывод.
 */
function runRetain(
  args: string[],
  fixture: Fixture,
): { removed: string[]; stdout: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "retain-images-"));
  const removedLog = path.join(dir, "removed.log");
  const dfCounter = path.join(dir, "df.count");
  const freeSeq = Array.isArray(fixture.freeGb) ? fixture.freeGb : [fixture.freeGb];

  fs.writeFileSync(
    path.join(dir, "docker"),
    `#!/usr/bin/env bash
case "$1" in
  inspect)
    ${fixture.running ? `printf '%s\\n' '${fixture.running}'` : "exit 1"} ;;
  images)
    # --format отдаёт "<created>\\t<repo>:<tag>"; выдаём по убыванию времени,
    # чтобы поймать скрипт на неверной сортировке, если он на неё полагается.
    i=0
    for tag in ${fixture.images.map((t) => `'${t}'`).join(" ")}; do
      # намеренно в ПРОИЗВОЛЬНОМ порядке вывода, но с честными метками времени
      printf '2026-08-%02d 00:00:00 +0000 UTC\\t%s:%s\\n' "$(( 20 - i ))" "$2" "$tag"
      i=$(( i + 1 ))
    done ;;
  rmi)
    shift
    for img in "$@"; do printf '%s\\n' "$img" >> '${removedLog}'; done ;;
  image) : ;;
esac
exit 0
`,
    { mode: 0o755 },
  );

  fs.writeFileSync(
    path.join(dir, "sudo"),
    `#!/usr/bin/env bash\nexec "$@"\n`,
    { mode: 0o755 },
  );

  fs.writeFileSync(
    path.join(dir, "df"),
    `#!/usr/bin/env bash
n=$(cat '${dfCounter}' 2>/dev/null || echo 0)
seq=(${freeSeq.join(" ")})
idx=$n
if [ "$idx" -ge "\${#seq[@]}" ]; then idx=$(( \${#seq[@]} - 1 )); fi
echo $(( n + 1 )) > '${dfCounter}'
printf 'Avail\\n%sG\\n' "\${seq[$idx]}"
`,
    { mode: 0o755 },
  );

  const stdout = execFileSync("bash", [SCRIPT, ...args], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH ?? ""}` },
    encoding: "utf8",
  });

  const removed = fs.existsSync(removedLog)
    ? fs.readFileSync(removedLog, "utf8").trim().split("\n").filter(Boolean)
    : [];
  fs.rmSync(dir, { recursive: true, force: true });
  return { removed, stdout };
}

describe("INC-095 — сколько релизных образов остаётся на ноде", () => {
  it("скрипт доставляется в репозитории и исполняем", () => {
    expect(fs.existsSync(SCRIPT)).toBe(true);
    // eslint-disable-next-line no-bitwise
    expect(fs.statSync(SCRIPT).mode & 0o111).toBeTruthy();
  });

  it("прод перед загрузкой оставляет текущий и один запасной", () => {
    const { removed } = runRetain(
      ["eterapy-web", "eterapy-web-1", "2", "newsha11", "0"],
      {
        images: ["newsha11", "cur00000", "prev0001", "prev0002", "prev0003"],
        running: "eterapy-web:cur00000",
        freeGb: 20,
      },
    );
    // приезжающий не считается в лимит, текущий неприкосновенен,
    // из старых остаётся ровно один — он и станет вторым предыдущим.
    expect(removed.sort()).toEqual(
      ["eterapy-web:prev0002", "eterapy-web:prev0003"].sort(),
    );
  });

  it("прод после конвергенции оставляет текущий и два предыдущих", () => {
    const { removed } = runRetain(["eterapy-web", "eterapy-web-1", "3", "", "0"], {
      images: ["cur00000", "prev0001", "prev0002", "prev0003", "prev0004"],
      running: "eterapy-web:cur00000",
      freeGb: 20,
    });
    expect(removed.sort()).toEqual(
      ["eterapy-web:prev0003", "eterapy-web:prev0004"].sort(),
    );
  });

  it("стенд не хранит предыдущих образов вовсе", () => {
    const { removed } = runRetain(
      ["eterapy-web-staging", "eterapy-staging-web-1", "1", "", "0"],
      {
        images: ["cur00000", "prev0001", "prev0002"],
        running: "eterapy-web-staging:cur00000",
        freeGb: 20,
      },
    );
    expect(removed.sort()).toEqual(
      ["eterapy-web-staging:prev0001", "eterapy-web-staging:prev0002"].sort(),
    );
  });

  it("образ работающего контейнера не удаляется никогда", () => {
    // Самый старый образ на ноде — и при этом работающий: так бывает после
    // отката. Лимит `1` не должен его снести: удалить образ живого контейнера
    // — это остановить прод ради политики хранения.
    const { removed } = runRetain(
      ["eterapy-web", "eterapy-web-1", "1", "", "0"],
      {
        images: ["newer001", "newer002", "old00000"],
        running: "eterapy-web:old00000",
        freeGb: 20,
      },
    );
    expect(removed).not.toContain("eterapy-web:old00000");
    expect(removed.sort()).toEqual(
      ["eterapy-web:newer001", "eterapy-web:newer002"].sort(),
    );
  });

  it("при нехватке места запасной образ приносится в жертву выкатке, и это сказано вслух", () => {
    // eterapy-1 (30 GB на прод, стенд и Postgres) и eterapy-4 (19 GB) сегодня
    // не вмещают «два предыдущих». Выкатка не должна из-за этого падать, но и
    // молчать о потерянном откате нельзя.
    const { removed, stdout } = runRetain(
      ["eterapy-web", "eterapy-web-1", "2", "newsha11", "9"],
      {
        images: ["newsha11", "cur00000", "prev0001"],
        running: "eterapy-web:cur00000",
        freeGb: [3, 3, 12],
      },
    );
    expect(removed).toContain("eterapy-web:prev0001");
    expect(removed).not.toContain("eterapy-web:cur00000");
    expect(removed).not.toContain("eterapy-web:newsha11");
    expect(stdout).toContain("откат на него станет невозможен");
  });

  it("при достаточном месте запасной образ сохраняется", () => {
    const { removed } = runRetain(
      ["eterapy-web", "eterapy-web-1", "2", "newsha11", "9"],
      {
        images: ["newsha11", "cur00000", "prev0001"],
        running: "eterapy-web:cur00000",
        freeGb: 20,
      },
    );
    expect(removed).toEqual([]);
  });

  it("нет ни одного образа репозитория — выходим тихо и без ошибки", () => {
    const { removed, stdout } = runRetain(
      ["eterapy-web-staging", "eterapy-staging-web-1", "1", "", "0"],
      { images: [], running: null, freeGb: 20 },
    );
    expect(removed).toEqual([]);
    expect(stdout).toContain("чистить нечего");
  });
});

describe("INC-095 — выкатка применяет политику, а не описывает её", () => {
  const prod = fs.readFileSync(
    path.join(REPO_ROOT, ".github/workflows/deploy.yml"),
    "utf8",
  );
  const staging = fs.readFileSync(
    path.join(REPO_ROOT, ".github/workflows/deploy-staging.yml"),
    "utf8",
  );

  it("прод-выкатка чистит образы ДО загрузки нового", () => {
    const cleanupAt = prod.indexOf("retain-release-images.sh eterapy-web eterapy-web-1 2");
    const loadAt = prod.indexOf('docker save "eterapy-web:');
    expect(cleanupAt).toBeGreaterThan(-1);
    expect(loadAt).toBeGreaterThan(-1);
    expect(cleanupAt).toBeLessThan(loadAt);
  });

  it("прод-выкатка добивает лимит до трёх после конвергенции", () => {
    expect(prod).toContain("retain-release-images.sh eterapy-web eterapy-web-1 3");
  });

  it("прод-выкатка не оставляет стенду ни одного запасного образа", () => {
    expect(prod).toContain(
      "retain-release-images.sh eterapy-web-staging eterapy-staging-web-1 1",
    );
  });

  it("выкатка стенда чистит образы до загрузки и после конвергенции", () => {
    const calls = staging.match(
      /retain-release-images\.sh eterapy-web-staging eterapy-staging-web-1 1/g,
    );
    expect(calls).toHaveLength(2);
  });

  it("ни один workflow больше не носит собственную копию правила", () => {
    for (const wf of [prod, staging]) {
      expect(wf).not.toMatch(/docker images eterapy-web(-staging)? --format/);
    }
  });
});
