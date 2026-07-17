import { renderToStaticMarkup } from "react-dom/server";
import {
  LEGAL_DOCUMENTS,
  INTERNAL_LEGAL_DOC_NUMBERS,
  getLegalDoc,
  allLegalDocSlugs,
  legalDocVersionId,
} from "@/lib/legal/registry";
import { legalDocMarkdown } from "@/lib/legal/pack";
import { LegalMarkdown } from "@/components/legal/legal-markdown";

describe("B431 — legal registry", () => {
  it("publishes exactly the 14 public documents (1-14)", () => {
    expect(LEGAL_DOCUMENTS).toHaveLength(14);
    const numbers = LEGAL_DOCUMENTS.map((d) => d.docNumber).sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it("never routes internal documents (15, 16, 17, 19)", () => {
    for (const n of INTERNAL_LEGAL_DOC_NUMBERS) {
      expect(LEGAL_DOCUMENTS.some((d) => d.docNumber === n)).toBe(false);
    }
    expect(getLegalDoc("does-not-exist")).toBeUndefined();
  });

  it("derives a stable version id per slug", () => {
    // B525: пакет переиздан редакцией 1.1 от 2026-07-16.
    expect(legalDocVersionId("offer")).toBe("offer-v1.1-2026-07-16");
    expect(legalDocVersionId("consent")).toBe("consent-v1.1-2026-07-16");
  });
});

describe("B431 — legal pack content pipeline", () => {
  it("slices a non-empty body for every public document", () => {
    for (const slug of allLegalDocSlugs()) {
      const md = legalDocMarkdown(slug);
      expect(md.length).toBeGreaterThan(50);
      expect(md).not.toContain("## Документ");
    }
  });

  it("fills publishable placeholders and neutralizes the payment provider", () => {
    const all = allLegalDocSlugs().map((s) => legalDocMarkdown(s)).join("\n");
    expect(all).not.toContain("[Дата публикации]");
    expect(all).not.toContain("[Версия документа]");
    expect(all).not.toContain("[Email поддержки]");
    expect(all).not.toContain("[Email для ПДн]");
    expect(all).not.toContain("[Ссылка на сайт]");
    expect(all).not.toContain("[Ссылка на личный кабинет]");
    expect(all).not.toContain("[указать срок]");
    expect(all).not.toContain("Твои платежи");
    expect(all).toContain("support@eterapy.com");
    expect(all).toContain("privacy@eterapy.com");
  });

  it("keeps company requisites as visible placeholders until the entity exists", () => {
    const offer = legalDocMarkdown("offer");
    expect(offer).toContain("[ИНН]");
    expect(offer).toContain("[ОГРНИП]");
  });
});

describe("B431 — legal markdown renderer", () => {
  it("renders headings, bold, lists and tables without raw markdown", () => {
    const md = [
      "### 1. Заголовок",
      "",
      "Текст с **выделением**.",
      "",
      "- пункт один",
      "- пункт два",
      "",
      "| Тариф | Цена |",
      "| --- | --- |",
      "| Plus | 590 |",
    ].join("\n");
    const html = renderToStaticMarkup(<LegalMarkdown markdown={md} />);
    expect(html).toContain("<h2>1. Заголовок</h2>");
    expect(html).toContain("<strong>выделением</strong>");
    expect(html).toContain("<li>пункт один</li>");
    expect(html).toContain("<table");
    expect(html).toContain("<th>Тариф</th>");
    expect(html).toContain("<td>Plus</td>");
    expect(html).not.toContain("###");
    expect(html).not.toContain("**");
  });

  it("renders a real public document end-to-end", () => {
    const html = renderToStaticMarkup(<LegalMarkdown markdown={legalDocMarkdown("points")} />);
    expect(html).toContain("Баллы ясности");
    expect(html).not.toContain("[Дата публикации]");
  });
});
