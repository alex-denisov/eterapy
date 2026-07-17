/**
 * B525 — юридический аудит пакета (редакция 1.1).
 *
 * Тесты закрепляют инварианты, которые легко потерять при следующей правке
 * текстов: агентскую конструкцию, разделение договоров и денежных категорий,
 * раскрытия владельца агрегатора, соответствие текста коду (B481/B484) и то,
 * что транскрибация покрыта регистрационными условиями, а не отдельной галочкой.
 */
import fs from "node:fs";
import path from "node:path";
import { legalDocMarkdown } from "@/lib/legal/pack";
import {
  LEGAL_PACK_VERSION,
  LEGAL_PACK_PUBLISHED_AT,
  getLegalDoc,
} from "@/lib/legal/registry";
import { buildConsentRecords } from "@/lib/legal/consent";
import { DEFAULT_LATE_CANCEL_PENALTY_PERCENT } from "@/lib/booking-change-rules";
import { penaltyPractitionerShareKopecks } from "@/lib/booking-penalty";
import {
  LATE_CANCEL_DEPRIORITIZE_THRESHOLD,
  NO_SHOW_DEPRIORITIZE_THRESHOLD,
  RELIABILITY_WINDOW_DAYS,
  lateCancelGoodwillCredits,
  noShowCompensationCredits,
} from "@/lib/practitioner-reliability";

const source = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("B525 — версия пакета", () => {
  it("публикует редакцию 1.1 от 2026-07-16", () => {
    expect(LEGAL_PACK_VERSION).toBe("1.1");
    expect(LEGAL_PACK_PUBLISHED_AT).toBe("2026-07-16");
  });

  it("подставляет актуальную редакцию и дату в тексты", () => {
    const offer = legalDocMarkdown("offer");
    expect(offer).not.toContain("[Версия документа]");
    expect(offer).not.toContain("[Дата публикации]");
  });

  it("не рендерит мета-строку «Оператор платформы» в теле документа", () => {
    expect(legalDocMarkdown("offer").startsWith("### 1.")).toBe(true);
  });
});

describe("B525 — агентская конструкция и разделение договоров", () => {
  const offer = legalDocMarkdown("offer");
  const agent = legalDocMarkdown("agent-offer");

  it("оферта называет платформу Оператором, а не Исполнителем", () => {
    expect(offer).toContain("Оператор платформы");
    // «Исполнитель» остаётся только применительно к практику.
    expect(offer).not.toContain("Исполнитель предоставляет");
    expect(offer).not.toContain("обязательством Исполнителя");
  });

  it("фиксирует «от имени и за счёт Практика» в обеих офертах (ст. 1005 ГК)", () => {
    expect(offer).toContain("от имени и за счёт Практика");
    expect(offer).toContain("ст. 1005 ГК РФ");
    expect(agent).toContain("от имени и за счёт Принципала");
    expect(agent).toContain("ст. 1005 ГК РФ");
  });

  it("прямо говорит, что договор на сессию — между Клиентом и Практиком", () => {
    expect(offer).toContain("между Клиентом и Практиком");
    expect(offer).toContain("не является исполнителем услуги Практика");
    expect(legalDocMarkdown("sessions")).toContain("между Клиентом и Практиком");
  });
});

describe("B525 — три денежные категории", () => {
  const offer = legalDocMarkdown("offer");
  const agent = legalDocMarkdown("agent-offer");

  it("разводит цену услуги, сервисный сбор и агентское вознаграждение", () => {
    for (const text of [offer, agent]) {
      expect(text).toContain("Цена услуги Практика");
      expect(text).toContain("Сервисный сбор ETerapy");
      expect(text).toContain("Агентское вознаграждение");
    }
  });

  it("говорит, что комиссию платит практик, а не клиент", () => {
    expect(offer).toContain("Клиент не уплачивает агентское вознаграждение");
  });
});

describe("B525 — раскрытия владельца агрегатора (ЗоЗПП)", () => {
  const offer = legalDocMarkdown("offer");

  it("перечисляет обязательные сведения о практике до оплаты", () => {
    for (const item of ["ИНН", "ОГРНИП", "юридический статус", "квалификации", "цена услуги Практика"]) {
      expect(offer.toLowerCase()).toContain(item.toLowerCase());
    }
  });

  it("обязывает практика согласиться на раскрытие в агентской оферте", () => {
    expect(legalDocMarkdown("agent-offer")).toContain("владельцу агрегатора");
  });

  it("политика ПДн объясняет публикацию реестровых сведений о практике", () => {
    expect(legalDocMarkdown("privacy")).toContain("официальных государственных реестров");
  });
});

describe("B525 — B481: удержание за позднюю отмену соответствует коду", () => {
  const sessions = legalDocMarkdown("sessions");

  it("называет тот же процент, что и дефолт в коде", () => {
    expect(DEFAULT_LATE_CANCEL_PENALTY_PERCENT).toBe(50);
    expect(sessions).toContain(`${DEFAULT_LATE_CANCEL_PENALTY_PERCENT}% цены услуги Практика`);
  });

  it("описывает распределение по комиссионной матрице, как считает код", () => {
    // Код: практик получает penalty × (1 − комиссия%).
    expect(penaltyPractitionerShareKopecks(100_000, 30)).toBe(70_000);
    expect(sessions).toContain("за вычетом агентского вознаграждения");
    expect(legalDocMarkdown("agent-offer")).toContain("за вычетом агентского вознаграждения");
  });

  it("фиксирует бесплатность переноса и право практика простить удержание", () => {
    expect(sessions).toContain("Перенос бесплатен");
    expect(sessions).toContain("без штрафа");
  });
});

describe("B525 — B484: отмена практиком, возврат и goodwill", () => {
  const sessions = legalDocMarkdown("sessions");

  it("гарантирует клиенту полный возврат при отмене практиком", () => {
    expect(sessions).toContain("Клиент всегда получает полный возврат");
  });

  it("называет пороги и окно надёжности из кода", () => {
    expect(RELIABILITY_WINDOW_DAYS).toBe(30);
    expect(LATE_CANCEL_DEPRIORITIZE_THRESHOLD).toBe(3);
    expect(NO_SHOW_DEPRIORITIZE_THRESHOLD).toBe(2);
    expect(sessions).toContain("30 дней");
    expect(sessions).toContain(`${LATE_CANCEL_DEPRIORITIZE_THRESHOLD} и более поздних отменах`);
    expect(sessions).toContain(`${NO_SHOW_DEPRIORITIZE_THRESHOLD} и более подтверждённых неявках`);
  });

  it("называет размер goodwill-компенсации из кода", () => {
    expect(lateCancelGoodwillCredits({} as NodeJS.ProcessEnv)).toBe(1);
    expect(noShowCompensationCredits({} as NodeJS.ProcessEnv)).toBe(3);
    expect(sessions).toContain("1 балл ясности");
    expect(sessions).toContain("3 балла ясности");
  });

  it("подтверждает отсутствие денежных штрафов для практика", () => {
    expect(legalDocMarkdown("agent-offer")).toContain("не взимает со Специалиста денежных штрафов");
  });
});

describe("B525 — транскрибация покрыта регистрацией, а не галочкой в услуге", () => {
  it("документ 14 переименован в правила и помечен как не-акцепт", () => {
    expect(getLegalDoc("transcription")!.title).toBe("Правила транскрибации и AI-обработки сессий");
    const doc = legalDocMarkdown("transcription");
    expect(doc).toContain("не является отдельным согласием");
    expect(doc).toContain("при регистрации");
  });

  it("договорный пакет регистрации включает uploads и transcription", () => {
    const [contract] = buildConsentRecords("u1", {});
    expect(contract.checkboxType).toBe("CONTRACT");
    expect(contract.documentVersions.transcription).toBeDefined();
    expect(contract.documentVersions.uploads).toBeDefined();
  });

  it("чекбоксов при регистрации по-прежнему ровно два", () => {
    expect(buildConsentRecords("u1", {})).toHaveLength(2);
    const page = source("src/app/(auth)/register/page.tsx");
    expect(page).toContain('data-testid="consent-contract"');
    expect(page).toContain('data-testid="consent-pdn"');
    expect(page.match(/type="checkbox"/g) ?? []).toHaveLength(2);
    expect(page).toContain("/legal/transcription");
    expect(page).toContain("/legal/uploads");
  });
});

describe("B525 — сторонние видеосервисы допускаются без переподписания", () => {
  it("оферта и правила сессий допускают смену видеосервиса", () => {
    expect(legalDocMarkdown("offer")).toContain("сторонние");
    expect(legalDocMarkdown("offer")).toContain("не требует переподписания");
    expect(legalDocMarkdown("sessions")).toContain("сторонние видеосервисы");
  });
});

describe("B525 — ограничения владельца соблюдены", () => {
  const all = [
    "offer",
    "terms",
    "privacy",
    "consent",
    "sessions",
    "uploads",
    "transcription",
    "agent-offer",
  ]
    .map((s) => legalDocMarkdown(s as Parameters<typeof legalDocMarkdown>[0]))
    .join("\n");

  it("не заявляет обязанностей организатора распространения информации", () => {
    for (const term of [
      "организатор распространения информации",
      "организатора распространения информации",
      "реестр организаторов",
      "СОРМ",
      "97-ФЗ",
    ]) {
      expect(all).not.toContain(term);
    }
  });

  it("не собирает согласий третьих лиц при загрузке материалов", () => {
    expect(legalDocMarkdown("uploads")).toContain("не собирает и не запрашивает согласия третьих лиц");
  });

  it("сохраняет плейсхолдеры реквизитов и безымянный платёжный сервис", () => {
    expect(legalDocMarkdown("offer")).toContain("[ИНН]");
    expect(legalDocMarkdown("offer")).toContain("[ОГРНИП]");
    expect(all).not.toContain("Твои платежи");
  });
});
