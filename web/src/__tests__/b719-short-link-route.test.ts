import { GET } from "@/app/(public)/s/[platform]/[...target]/route";

describe("GET /s/[platform]/[...target]", () => {
  it("redirects valid platform and path to canonical URL with UTM parameters", async () => {
    const request = new Request("https://eterapy.com/s/vk/library/9-arkan-otshelnik-v-matritse-sudby");
    const response = await GET(request, {
      params: Promise.resolve({
        platform: "vk",
        target: ["library", "9-arkan-otshelnik-v-matritse-sudby"],
      }),
    });

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toBe(
      "https://eterapy.com/library/9-arkan-otshelnik-v-matritse-sudby?utm_source=vk&utm_medium=social&utm_campaign=library"
    );
    expect(response.headers.get("cache-control")).toContain("public");
  });

  it("handles normalized platform alias (tg -> telegram)", async () => {
    const request = new Request("https://eterapy.com/s/tg/products/natal-chart");
    const response = await GET(request, {
      params: Promise.resolve({
        platform: "tg",
        target: ["products", "natal-chart"],
      }),
    });

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toBe(
      "https://eterapy.com/products/natal-chart?utm_source=telegram&utm_medium=social&utm_campaign=products"
    );
  });

  it("safely falls back to root for invalid platform or suspicious paths", async () => {
    const request = new Request("https://eterapy.com/s/unknown/path");
    const response = await GET(request, {
      params: Promise.resolve({
        platform: "unknown",
        target: ["path"],
      }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://eterapy.com/");
  });

  it("resolves canonical origin when called through internal reverse proxy (0.0.0.0:3000)", async () => {
    const request = new Request("http://0.0.0.0:3000/s/vk/products/natal-chart");
    const response = await GET(request, {
      params: Promise.resolve({
        platform: "vk",
        target: ["products", "natal-chart"],
      }),
    });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://eterapy.com/products/natal-chart?utm_source=vk&utm_medium=social&utm_campaign=products"
    );
  });
});
