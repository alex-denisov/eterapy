import type { NextRequest } from "next/server";

jest.mock("@/lib/session-from-cookie", () => ({
  getSessionFromCookie: jest.fn(),
}));

import { internalRewriteUrl, shouldRedirectAppPublicPathToMain } from "@/proxy";
import { v5Products } from "@/lib/v5-products";

function request(url: string, headers: Record<string, string> = {}): NextRequest {
  const nextUrl = new URL(url) as URL & { clone(): URL };
  nextUrl.clone = () => new URL(url);
  return { url, nextUrl, headers: new Headers(headers) } as unknown as NextRequest;
}

describe("subdomain proxy rewrites", () => {
  it("swaps the loopback nextUrl hostname to the 127.0.0.1 listener behind the proxy (INC-066)", () => {
    // initUrl роутера = `${proto}://127.0.0.1:<port>` (--hostname), а nextUrl
    // материализуется как localhost с тем же протоколом. Несовпадение по
    // ЛЮБОЙ части origin = внешний прокси-хоп, второй проход proxy срезает
    // nonce-CSP. Признак «за прокси» — публичный Host при loopback-nextUrl.
    const staged = internalRewriteUrl(
      request("https://localhost:3100/", { host: "staging.app.eterapy.com" }),
      "/cabinet",
    );
    expect(staged.toString()).toBe("https://127.0.0.1:3100/cabinet");

    // env-переопределение хоста листенера
    process.env.ETERAPY_INTERNAL_REWRITE_HOST = "10.0.0.5";
    try {
      const overridden = internalRewriteUrl(
        request("https://localhost:3100/", { host: "staging.app.eterapy.com" }),
        "/cabinet",
      );
      expect(overridden.toString()).toBe("https://10.0.0.5:3100/cabinet");
    } finally {
      delete process.env.ETERAPY_INTERNAL_REWRITE_HOST;
    }

    // Локальный dev/jest (нет x-forwarded-proto): чистый same-origin clone.
    const local = internalRewriteUrl(
      request("http://localhost:3000/", { host: "localhost:3000" }),
      "/cabinet",
    );
    expect(local.toString()).toBe("http://localhost:3000/cabinet");

    const app = internalRewriteUrl(
      request("https://app.eterapy.com/diary?tab=1", { host: "app.eterapy.com" }),
      "/cabinet/diary",
    );
    expect(app.origin).toBe("https://app.eterapy.com");
    expect(app.pathname).toBe("/cabinet/diary");
    // search сбрасывается — вызывающая сторона переносит его явно
    expect(app.search).toBe("");
  });

  it("keeps public product and funnel routes canonical on the main domain", () => {
    for (const path of ["/products/deep-report", "/pricing", "/tarot", "/checkin"]) {
      expect(shouldRedirectAppPublicPathToMain(path)).toBe(true);
    }

    for (const path of ["/products", "/", "/billing", "/questions", "/cabinet", "/cabinet/billing"]) {
      expect(shouldRedirectAppPublicPathToMain(path)).toBe(false);
    }
  });

  it("keeps the practitioner cabinet on the app subdomain (T23 regression)", () => {
    // /cabinet/practitioner strips to /practitioner on the app subdomain.
    // It must NOT redirect to main, otherwise the whole practitioner cabinet
    // (home + every subpage) bounces to eterapy.com and login is unreachable.
    expect(shouldRedirectAppPublicPathToMain("/practitioner")).toBe(false);
    expect(shouldRedirectAppPublicPathToMain("/practitioner/clients")).toBe(false);
    expect(shouldRedirectAppPublicPathToMain("/practitioner/schedule")).toBe(false);
    // The public directory (plural) stays canonical on the main domain.
    expect(shouldRedirectAppPublicPathToMain("/practitioners")).toBe(true);
    expect(shouldRedirectAppPublicPathToMain("/practitioners/some-slug")).toBe(true);
  });

  it("allows /modalities on app subdomain so /cabinet/modalities nav link resolves correctly", () => {
    // /modalities must NOT be in the redirect list — after the proxy strips /cabinet,
    // app.eterapy.com/modalities must be rewritten to /cabinet/modalities, not sent to main domain.
    expect(shouldRedirectAppPublicPathToMain("/modalities")).toBe(false);
    expect(shouldRedirectAppPublicPathToMain("/modalities/checkin")).toBe(false);
    // a live product page (e.g. /products/reframe) stays on main
    expect(shouldRedirectAppPublicPathToMain("/products/reframe")).toBe(true);
  });

  it("allows the stripped wallet path on app subdomain so it rewrites to /cabinet/wallet", () => {
    expect(shouldRedirectAppPublicPathToMain("/wallet")).toBe(false);
  });

  it("B387/B389: every valid product page is public (derived from v5Products, not a hardcoded list)", () => {
    // Регрессия: human-design и family-scenarios отсутствовали в хардкод-списке и
    // гнались в /login на app-поддомене. Теперь публичность деривится из v5Products.
    for (const product of v5Products) {
      expect(shouldRedirectAppPublicPathToMain(product.route)).toBe(true);
    }
    expect(shouldRedirectAppPublicPathToMain("/products/human-design")).toBe(true);
    expect(shouldRedirectAppPublicPathToMain("/products/family-scenarios")).toBe(true);
    // B417: /products/chat lives on its own static route (not in v5Products) but
    // must still be recognised as a public product page (else middleware 404s it).
    expect(shouldRedirectAppPublicPathToMain("/products/chat")).toBe(true);
    // Неизвестный слаг услуги — НЕ публичный (отдаётся 404 отдельной логикой).
    expect(shouldRedirectAppPublicPathToMain("/products/definitely-not-a-product")).toBe(false);
  });
});
