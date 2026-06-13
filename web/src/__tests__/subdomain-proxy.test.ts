import type { NextRequest } from "next/server";

jest.mock("@/lib/session-from-cookie", () => ({
  getSessionFromCookie: jest.fn(),
}));

import { internalRewriteUrl, shouldRedirectAppPublicPathToMain } from "@/proxy";
import { v5Products } from "@/lib/v5-products";

function request(url: string): NextRequest {
  return { url } as NextRequest;
}

describe("subdomain proxy rewrites", () => {
  it("forces local HTTPS rewrite targets back to HTTP for the PM2 listener", () => {
    const url = internalRewriteUrl(request("https://localhost:3000/"), "/cabinet");

    expect(url.toString()).toBe("http://localhost:3000/cabinet");
  });

  it("keeps real domain rewrite targets on their original protocol", () => {
    const url = internalRewriteUrl(request("https://app.eterapy.com/"), "/cabinet");

    expect(url.toString()).toBe("https://app.eterapy.com/cabinet");
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
    // /products/clarity-practice (public daily-practice product) stays on main
    expect(shouldRedirectAppPublicPathToMain("/products/clarity-practice")).toBe(true);
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
    // Неизвестный слаг услуги — НЕ публичный (отдаётся 404 отдельной логикой).
    expect(shouldRedirectAppPublicPathToMain("/products/definitely-not-a-product")).toBe(false);
  });
});
