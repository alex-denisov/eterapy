import { searchFaq, categoryAllowsChat, SUPPORT_CATEGORIES } from "@/lib/support-faq";

describe("B464 IB6 support-faq — search gate", () => {
  it("returns nothing for an empty query", () => {
    expect(searchFaq("")).toEqual([]);
    expect(searchFaq("   ")).toEqual([]);
  });

  it("matches on question, answer, or keyword text", () => {
    expect(searchFaq("возврат").some((e) => e.id === "refund")).toBe(true);
    expect(searchFaq("подписк").some((e) => e.id === "subscription")).toBe(true);
    expect(searchFaq("pin").some((e) => e.id === "privacy")).toBe(true);
  });
});

describe("B464 IB6 support-faq — category chat gating", () => {
  it("offers live chat ONLY for the six sensitive categories", () => {
    const chatCats = SUPPORT_CATEGORIES.filter((c) => c.liveChat).map((c) => c.id).sort();
    expect(chatCats).toEqual(
      ["account", "cancellations", "finance", "privacy", "refunds", "specialist"].sort(),
    );
  });

  it("denies chat for general categories", () => {
    expect(categoryAllowsChat("product")).toBe(false);
    expect(categoryAllowsChat("technical")).toBe(false);
    expect(categoryAllowsChat("finance")).toBe(true);
    expect(categoryAllowsChat("unknown")).toBe(false);
  });
});
