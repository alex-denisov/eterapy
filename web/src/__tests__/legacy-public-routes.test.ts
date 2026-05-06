import { legacyPublicRedirect } from "@/lib/legacy-public-routes";

describe("legacy public route redirects", () => {
  it.each([
    ["/modalities", "/all-modalities"],
    ["/modalities/", "/all-modalities"],
    ["/tools", "/all-modalities"],
    ["/tools/", "/all-modalities"],
    ["/modalities/tarot", "/all-modalities/checkin?source=legacy-tarot"],
    ["/tools/checkin", "/all-modalities/checkin"],
    ["/tools/reflection", "/all-modalities/checkin"],
    ["/tools/guide", "/all-modalities/checkin?source=legacy-guide"],
    ["/all-modalities/tarot", "/all-modalities/checkin?source=legacy-tarot"],
    ["/all-modalities/guide", "/all-modalities/checkin?source=legacy-guide"],
    ["/modalities/horoscope", "/all-modalities/checkin?source=legacy-horoscope"],
    ["/modalities/natal", "/all-modalities/checkin?source=legacy-natal"],
    ["/modalities/numerology", "/all-modalities/checkin?source=legacy-numerology"],
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
    expect(legacyPublicRedirect("/all-modalities/checkin")).toBeNull();
    expect(legacyPublicRedirect("/practitioners/some-specialist")).toBeNull();
  });
});
