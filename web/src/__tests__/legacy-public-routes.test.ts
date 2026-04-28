import { legacyPublicRedirect } from "@/lib/legacy-public-routes";

describe("legacy public route redirects", () => {
  it.each([
    ["/modalities", "/all-modalities"],
    ["/modalities/", "/all-modalities"],
    ["/tools", "/all-modalities"],
    ["/tools/", "/all-modalities"],
    ["/modalities/tarot", "/all-modalities/tarot"],
    ["/tools/checkin", "/all-modalities/checkin"],
    ["/tools/reflection", "/all-modalities/checkin"],
    ["/modalities/horoscope", "/all-modalities/horoscope"],
    ["/modalities/unknown", "/all-modalities"],
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
    expect(legacyPublicRedirect("/all-modalities")).toBeNull();
    expect(legacyPublicRedirect("/all-modalities/tarot")).toBeNull();
    expect(legacyPublicRedirect("/practitioners/some-specialist")).toBeNull();
  });
});
