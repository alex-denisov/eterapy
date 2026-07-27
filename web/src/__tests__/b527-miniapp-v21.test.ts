import { MINIAPP_SERVICES, MINIAPP_DIARY_SERVICE } from "@/lib/miniapp/catalog";
import { MINIAPP_FEATURES, miniAppFeatureForPath, miniAppRoute } from "@/lib/miniapp/registry";
import { v5Products } from "@/lib/v5-products";

describe("B527 — Mini App v2.1 product contract", () => {
  it("keeps exactly five route-based tabs with Services in the centre", () => {
    expect(MINIAPP_FEATURES.map((feature) => feature.id)).toEqual([
      "home",
      "dialogues",
      "services",
      "diary",
      "profile",
    ]);
    expect(MINIAPP_FEATURES[2]).toMatchObject({
      id: "services",
      // B606: одно название входа в каталог на всех поверхностях.
      label: "Разобрать",
      route: "/miniapp/services",
      central: true,
    });
    expect(miniAppRoute("diary")).toBe("/miniapp/diary");
    expect(miniAppFeatureForPath("/miniapp/profile/").id).toBe("profile");
  });

  it("derives the visible digital catalogue from the production product registry", () => {
    const productionProducts = v5Products.filter((product) => product.slug !== "family-questions");
    for (const product of productionProducts) {
      expect(MINIAPP_SERVICES).toContainEqual(expect.objectContaining({
        slug: product.slug,
        title: product.name,
        price: product.price,
        href: `/miniapp/products/${product.slug}`,
      }));
    }
  });

  it("keeps the diary-only family mechanic out of the Services catalogue", () => {
    expect(MINIAPP_DIARY_SERVICE?.slug).toBe("family-questions");
    expect(MINIAPP_SERVICES.some((service) => service.slug === "family-questions")).toBe(false);
  });

  it("does not position catalogue entries as AI services", () => {
    const visibleCopy = MINIAPP_SERVICES
      .flatMap((service) => [service.title, service.eyebrow, service.description])
      .join(" ");
    expect(visibleCopy).not.toMatch(/(^|\s)(AI|ИИ)-/iu);
  });

  it("keeps catalogue links first-party and explicit", () => {
    for (const service of MINIAPP_SERVICES) {
      expect(service.href).toMatch(/^\/miniapp(?:\/|$)/);
    }
  });
});
