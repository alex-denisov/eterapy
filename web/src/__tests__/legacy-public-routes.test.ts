import { legacyPublicRedirect } from "@/lib/legacy-public-routes";

describe("legacy public route redirects", () => {
  it.each([
    ["/modalities", "/checkin"],
    ["/modalities/", "/checkin"],
    ["/tools", "/checkin"],
    ["/tools/", "/checkin"],
    ["/all-modalities", "/checkin"],
    ["/modalities/tarot", "/products/tarot"],
    ["/tools/checkin", "/checkin"],
    ["/tools/reflection", "/checkin"],
    ["/tools/guide", "/checkin?source=legacy-guide"],
    ["/all-modalities/tarot", "/products/tarot"],
    ["/all-modalities/guide", "/checkin?source=legacy-guide"],
    ["/modalities/horoscope", "/checkin?source=legacy-horoscope"],
    ["/modalities/natal", "/products/natal-chart"],
    ["/modalities/numerology", "/products/numerology"],
    ["/modalities/unknown", "/checkin"],
    ["/specialists", "/practitioners"],
    ["/experts", "/practitioners"],
    ["/catalog", "/practitioners"],
    ["/practitioner", "/practitioners"],
    ["/practitioners/catalog", "/practitioners"],
  ])("redirects %s to %s", (from, to) => {
    expect(legacyPublicRedirect(from)).toBe(to);
  });

  it("does not redirect current canonical public pages", () => {
    expect(legacyPublicRedirect("/")).toBeNull();
    expect(legacyPublicRedirect("/checkin")).toBeNull();
    expect(legacyPublicRedirect("/practitioners/some-specialist")).toBeNull();
  });
});
