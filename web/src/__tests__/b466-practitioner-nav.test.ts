import {
  PRACTITIONER_TABS,
  PRACTITIONER_MORE_HREFS,
  MORE_LABEL,
} from "@/lib/nav-model";

// B466 — practitioner cabinet «Practice cockpit» IA. These tests lock the
// owner-approved 5-group navigation (Сегодня · Клиенты · Календарь · Финансы ·
// Ещё) shared by the desktop sidebar and the mobile bottom bar, plus the set
// of sub-routes that light up the «Ещё» item.

const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe("B466 nav-model — practitioner tabs (Practice cockpit)", () => {
  it("orders the tabs Сегодня · Клиенты · Календарь · Финансы · Ещё", () => {
    expect(labels(PRACTITIONER_TABS)).toEqual([
      "Сегодня",
      "Клиенты",
      "Календарь",
      "Финансы",
      MORE_LABEL,
    ]);
  });

  it("routes the tabs to the 5-group cabinet destinations", () => {
    const hrefs = PRACTITIONER_TABS.map((t) => t.href);
    expect(hrefs[0]).toContain("/practitioner");
    expect(hrefs[0]).not.toContain("/practitioner/");
    expect(hrefs[1]).toContain("/practitioner/clients");
    expect(hrefs[2]).toContain("/practitioner/calendar");
    expect(hrefs[3]).toContain("/practitioner/finance");
    expect(hrefs[4]).toContain("/practitioner/more");
  });

  it("gives every tab a real destination — practitioner «Ещё» is a hub page, not a sheet", () => {
    for (const tab of PRACTITIONER_TABS) {
      expect(tab.href).not.toBe("");
    }
  });

  it("keeps distinct icon keys so the bar reads at a glance", () => {
    const keys = PRACTITIONER_TABS.map((t) => t.iconKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("B466 nav-model — «Ещё» umbrella sub-routes", () => {
  it("lights the «Ещё» item for the hub and every sub-section", () => {
    const joined = PRACTITIONER_MORE_HREFS.join(" ");
    for (const sub of [
      "/practitioner/more",
      "/practitioner/services",
      "/practitioner/reviews",
      "/practitioner/invite",
      "/practitioner/ethics",
      "/practitioner/profile",
    ]) {
      expect(joined).toContain(sub);
    }
  });

  it("does not swallow the primary tabs into the «Ещё» umbrella", () => {
    const joined = PRACTITIONER_MORE_HREFS.join(" ");
    expect(joined).not.toContain("/practitioner/clients");
    expect(joined).not.toContain("/practitioner/calendar");
    expect(joined).not.toContain("/practitioner/finance");
  });
});
