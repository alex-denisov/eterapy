/**
 * B572 (owner 2026-07-22) — все юридические документы датируются днём
 * регистрации ИП: 20.07.2026.
 *
 * Владелец: «ранее этой даты услуги не могли оказываться». Документ, датированный
 * июнем, обещает услуги от лица, которого тогда не существовало.
 *
 * Дата живёт в трёх местах и разъезжается молча: `LEGAL_PACK_PUBLISHED_AT`
 * (мета-строка страницы + versionId в consent-логах), подстановка
 * `[Дата публикации]` (тело документов) и слаг/подпись агентской оферты
 * для практиков. Тест держит их вместе.
 */
import fs from "node:fs";
import path from "node:path";
import { legalDocMarkdown } from "@/lib/legal/pack";
import {
  LEGAL_DOCUMENTS,
  LEGAL_PACK_PUBLISHED_AT,
  legalDocVersionId,
} from "@/lib/legal/registry";
import {
  AGENT_OFFER_VERSION,
  AGENT_OFFER_VERSION_LABEL,
} from "@/lib/practitioner-compliance";

const IP_REGISTERED_ISO = "2026-07-20";
const STALE_ISO = "2026-06-18";
const STALE_RU = "18 июня 2026";

describe("B572 — дата публикации = день регистрации ИП", () => {
  it("реестр датирован 20.07.2026", () => {
    expect(LEGAL_PACK_PUBLISHED_AT).toBe(IP_REGISTERED_ISO);
  });

  it("каждый публичный документ несёт эту дату — её печатает страница /legal/[doc]", () => {
    expect(LEGAL_DOCUMENTS.length).toBeGreaterThan(0);
    for (const doc of LEGAL_DOCUMENTS) {
      expect(doc.publishedAt).toBe(IP_REGISTERED_ISO);
    }
  });

  it("versionId, который уходит в consent-логи и привязку оферты к платежу, пересобран", () => {
    for (const doc of LEGAL_DOCUMENTS) {
      const versionId = legalDocVersionId(doc.slug);
      expect(versionId).toContain(IP_REGISTERED_ISO);
      expect(versionId).not.toContain(STALE_ISO);
    }
  });

  it("ни один отрендеренный документ не датирован раньше регистрации ИП", () => {
    for (const doc of LEGAL_DOCUMENTS) {
      const body = legalDocMarkdown(doc.slug);
      expect(body).not.toContain(STALE_ISO);
      expect(body).not.toContain(STALE_RU);
      // плейсхолдер обязан быть подставлен, иначе «нет июньской даты» ничего не значит
      expect(body).not.toContain("[Дата публикации]");
    }
  });

  it("подстановка [Дата публикации] обновлена вместе с реестром", () => {
    // Мета-строки срезаются рендерером, поэтому в теле дата обычно не всплывает —
    // проверяем саму таблицу подстановок, чтобы она не осталась на июне.
    const pack = fs.readFileSync(
      path.join(process.cwd(), "src", "lib", "legal", "pack.ts"),
      "utf8",
    );
    expect(pack).toContain('["[Дата публикации]", "20 июля 2026 г."]');
    expect(pack).not.toContain(STALE_RU);
  });

  it("агентская оферта практика датирована тем же днём", () => {
    expect(AGENT_OFFER_VERSION).toBe(`agent-offer-${IP_REGISTERED_ISO}`);
    expect(AGENT_OFFER_VERSION_LABEL).toBe("редакция от 20 июля 2026 года");
  });
});
