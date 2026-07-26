/**
 * B568 — аналитика на авторизованных поверхностях.
 *
 * Что было: оба счётчика поднимались ИНЛАЙНОВЫМ `<Script>`. Next добавляет
 * такой тег на клиенте после гидратации, серверный nonce до него не доходит —
 * и под nonce-политикой (`/cabinet`, `/admin`) браузер его резал. То есть в
 * кабинете аналитика не собиралась и не собиралась НИКОГДА, а продуктовые
 * решения по авторизованным поверхностям принимались на выборке из одних
 * публичных страниц.
 *
 * Почему починка — внешним файлом, а не пробросом nonce. `script-src` уже
 * разрешает `'self'` и хосты счётчиков, поэтому скрипт со своего origin
 * проходит обе политики без nonce вовсе. Проброс nonce потребовал бы читать
 * заголовки в дереве layout'ов — а `headers()` в корневом layout сделал бы
 * динамическими все 340+ пререндеренных страниц.
 *
 * Приватность: в URL кабинета лежат идентификаторы пользователей и разборов.
 * Во внешние счётчики уходит вычищенный адрес — иначе «починка» обменяла бы
 * одну проблему на худшую.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// Правило вычистки грузится ИЗ ОТДАВАЕМОГО ФАЙЛА, а не из копии в src: иначе
// тест защищал бы копию, а в браузер уезжал бы непроверенный оригинал.
const sandbox: Record<string, unknown> = { URL };
vm.runInNewContext(read("public/analytics/scrub.js"), sandbox);
const scrubAnalyticsUrl = sandbox.eterapyScrubAnalyticsUrl as (url: string) => string;

describe("B568 — счётчики поднимаются без инлайна", () => {
  const analytics = read("src/components/analytics.tsx");

  it("не вставляет тело скрипта инлайном — иначе nonce-политика его режет", () => {
    // `__html` — маркер инлайнового тела у next/script. Проверяем именно его:
    // это и есть то, что не проходит CSP без nonce.
    expect(analytics).not.toContain("__html");
  });

  it("грузит счётчик файлом со своего origin", () => {
    expect(analytics).toContain("/analytics/metrika.js");
  });

  it("держит этот файл в public — иначе он не отдастся", () => {
    expect(fs.existsSync(path.join(process.cwd(), "public/analytics/metrika.js"))).toBe(true);
  });

  it("поднимает аналитику в кабинете — там она и нужна", () => {
    // Молчим только на админской поверхности (B523): сессии администраторов
    // искажают продуктовые воронки.
    expect(analytics).toContain("isAdminSurface");
    expect(analytics).not.toContain("isCabinetSurface");
  });
});

describe("B568 — во внешние счётчики не уходят идентификаторы", () => {
  it("вычищает идентификаторы из пути", () => {
    expect(scrubAnalyticsUrl("https://app.eterapy.com/cabinet/clients/clzt1a2b3c4d5e6f7g8h9i0j"))
      .toBe("https://app.eterapy.com/cabinet/clients/:id");
    expect(scrubAnalyticsUrl("https://app.eterapy.com/cabinet/dialogues/3f8a1c2e-4b5d-6789-abcd-ef0123456789"))
      .toBe("https://app.eterapy.com/cabinet/dialogues/:id");
    expect(scrubAnalyticsUrl("https://app.eterapy.com/cabinet/bookings/12345"))
      .toBe("https://app.eterapy.com/cabinet/bookings/:id");
  });

  it("не трогает человекочитаемые адреса — на них стоит весь SEO", () => {
    expect(scrubAnalyticsUrl("https://eterapy.com/library/kak-vybrat-specialista"))
      .toBe("https://eterapy.com/library/kak-vybrat-specialista");
    expect(scrubAnalyticsUrl("https://eterapy.com/products/reframe"))
      .toBe("https://eterapy.com/products/reframe");
  });

  it("оставляет метки источника и выбрасывает остальной query", () => {
    // utm/yclid — то, на чём держится атрибуция; всё прочее может нести id.
    expect(scrubAnalyticsUrl("https://eterapy.com/?utm_source=yandex&utm_campaign=brand&dialogueId=abc123xyz789"))
      .toBe("https://eterapy.com/?utm_source=yandex&utm_campaign=brand");
    expect(scrubAnalyticsUrl("https://app.eterapy.com/cabinet?client=clzt1a2b3c4d5e6f7g8h9i0j"))
      .toBe("https://app.eterapy.com/cabinet");
  });

  it("выбрасывает фрагмент целиком", () => {
    expect(scrubAnalyticsUrl("https://app.eterapy.com/cabinet/diary#entry-clzt1a2b3c4d5e6f7g8h"))
      .toBe("https://app.eterapy.com/cabinet/diary");
  });

  it("не падает на мусоре вместо адреса", () => {
    expect(scrubAnalyticsUrl("не-адрес")).toBe("");
    expect(scrubAnalyticsUrl("")).toBe("");
  });
});

describe("B568 — правило вычистки одно на клиент и сервер", () => {
  it("файл в public зовёт общий сборщик, а не свою копию правила", () => {
    // Копия правила в public/ разошлась бы с модулем на первой же правке.
    expect(read("public/analytics/metrika.js")).toContain("eterapyScrubAnalyticsUrl");
    expect(read("public/analytics/scrub.js")).toContain("eterapyScrubAnalyticsUrl");
  });
});

/**
 * B579 (owner 2026-07-26): Google Analytics снят — передача данных в GA в РФ
 * под запретом. Тест держит запрет на уровне артефактов, а не намерения: нет
 * тега, нет загрузчика, нет переменной сборки и нет хоста в `script-src`.
 * Проверяется именно последнее — оставленный хост означал бы, что счётчик
 * возвращается одной правкой окружения.
 */
describe("B579 — Google Analytics снят целиком", () => {
  // Комментарии выброшены: они ОБЪЯСНЯЮТ снятие и потому содержат те же слова.
  // Тест на «в файле нет строки X» без этого падал бы от собственной пояснялки —
  // третий класс ложных падений на тестах-по-подстроке за две сессии.
  const code = read("src/components/analytics.tsx")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");

  it("не поднимает тег GA и не зовёт gtag", () => {
    expect(code).not.toContain("googletagmanager");
    expect(code).not.toContain("gtag");
  });

  it("не читает переменную измерителя GA", () => {
    expect(code).not.toContain("NEXT_PUBLIC_GA_MEASUREMENT_ID");
  });

  it("не отдаёт загрузчик GA из public", () => {
    expect(fs.existsSync(path.join(process.cwd(), "public/analytics/ga.js"))).toBe(false);
  });

  it("не разрешает хост GA в script-src", () => {
    expect(read("src/lib/security-headers.ts")).not.toContain("https://www.googletagmanager.com");
  });

  it("не передаёт измеритель GA в сборку образа", () => {
    // Переменная в Dockerfile/workflow вернула бы счётчик, даже если тег в
    // коде остался снятым — поэтому запрет проверяется и в артефактах деплоя.
    const repoRoot = path.join(process.cwd(), "..");
    for (const file of ["deploy/docker/Dockerfile", ".github/workflows/deploy.yml"]) {
      const source = fs.readFileSync(path.join(repoRoot, file), "utf8");
      expect(source).not.toMatch(/^[^#\n]*NEXT_PUBLIC_GA_MEASUREMENT_ID/m);
    }
  });
});
