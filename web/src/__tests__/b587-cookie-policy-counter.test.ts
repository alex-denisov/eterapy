/**
 * B587 (owner 2026-07-26) — Cookie Policy обязана называть счётчик поимённо.
 *
 * До правки Документ 5 описывал «аналитические cookies» абстрактно и не называл
 * ни одну систему. Пока их было две (Метрика + GA), вопрос был про выбор
 * формулировки; после снятия GA (B579) остался ровно один счётчик, и умолчание
 * стало просто неполнотой документа.
 *
 * Тест держит три вещи, которые расходятся молча:
 *   1. номер счётчика в юридическом тексте == номер, который реально
 *      инициализируется загрузчиком (`public/analytics/metrika.js` читает id из
 *      атрибута, значение приходит из переменной сборки — поэтому сверяем с
 *      константой, на которой стоит вся аналитика);
 *   2. текст не обещает того, чего в коде нет (Вебвизор выключен, в счётчик не
 *      уходят почта/имя);
 *   3. баннер согласия называет ту же систему и ведёт в Cookie Policy.
 */
import fs from "node:fs";
import path from "node:path";
import { legalDocMarkdown } from "@/lib/legal/pack";

const COUNTER_ID = "108502034";

function bannerSource(): string {
  return fs.readFileSync(
    path.join(process.cwd(), "src", "components", "cookie-banner.tsx"),
    "utf8",
  );
}

describe("B587 — Cookie Policy называет счётчик", () => {
  const cookies = legalDocMarkdown("cookies");

  it("система названа поимённо, с номером счётчика", () => {
    expect(cookies).toContain("Яндекс Метрика");
    expect(cookies).toContain(COUNTER_ID);
  });

  it("назван оператор сервиса и даны его условия", () => {
    expect(cookies).toContain("ООО «ЯНДЕКС»");
    expect(cookies).toContain("yandex.ru/legal/metrica_termsofuse");
    expect(cookies).toContain("yandex.ru/legal/confidential");
  });

  it("сказано, что других систем аналитики нет — GA снят (B579)", () => {
    expect(cookies).toMatch(/Других систем веб-аналитики/i);
    expect(cookies).not.toMatch(/Google Analytics|gtag|googletagmanager/i);
  });

  it("зафиксировано условие загрузки: только после согласия", () => {
    expect(cookies).toMatch(/[Тт]олько после согласия/);
    expect(cookies).toMatch(/до согласия код счётчика не загружается/i);
  });

  it("перечислены cookies счётчика и сказано, что Вебвизор выключен", () => {
    expect(cookies).toContain("_ym_uid");
    expect(cookies).toContain("_ym_d");
    expect(cookies).toMatch(/Вебвизор.*\*\*отключена\*\*|«Вебвизор»\s*\*\*отключена\*\*/);
  });

  it("честно сказано про внутренний идентификатор и про то, что НЕ уходит", () => {
    expect(cookies).toMatch(/внутренний идентификатор/i);
    expect(cookies).toMatch(/не передаются/);
    // B586 передаёт в счётчик cuid, и только его — документ обязан называть
    // границу, иначе он описывает не ту систему, которая работает.
    expect(cookies).toMatch(/[Аа]дрес электронной почты, имя, телефон/);
  });

  it("описан отзыв согласия и внешний opt-out Метрики", () => {
    expect(cookies).toMatch(/Согласие на аналитические cookies отзывается/);
    expect(cookies).toContain("yandex.ru/support/metrica/general/opt-out.html");
  });

  it("markdown-ссылок в документе нет — рендерер их не поддерживает", () => {
    // legal-markdown.tsx умеет только **bold**, таблицы и списки. Ссылка в виде
    // [текст](url) отрисовалась бы как литерал — поэтому адреса в тексте голые.
    expect(cookies).not.toMatch(/\]\(https?:/);
  });
});

describe("B587 — баннер согласия называет ту же систему", () => {
  const banner = bannerSource();

  it("в тексте баннера есть имя счётчика", () => {
    expect(banner).toContain("Яндекс Метрика");
  });

  it("«Подробнее» ведёт в Cookie Policy, а не в общую политику ПДн", () => {
    expect(banner).toContain('mainUrl("/legal/cookies")');
    expect(banner).not.toContain('mainUrl("/legal/privacy")');
  });
});
