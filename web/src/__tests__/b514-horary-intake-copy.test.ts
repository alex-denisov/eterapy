import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B514 Horary intake copy", () => {
  const actions = source("src/components/products/new-symbolic-product-actions.tsx");
  const locationInput = source("src/components/products/location-suggest-input.tsx");

  it("rotates useful question and location examples without the owner-rejected hints", () => {
    expect(actions).toContain("HORARY_LOCATION_EXAMPLES");
    expect(actions).toContain('useRotatingPlaceholder(HORARY_LOCATION_EXAMPLES, "horary-location")');
    expect(actions).toContain("placeholder={locationPlaceholder}");
    expect(actions).not.toContain("Сначала выберите категорию, затем сформулируйте один точный вопрос");
    expect(actions).not.toContain("Ивантеевка, Московская область");
  });

  it("keeps the shared location input configurable and its helper concise", () => {
    expect(locationInput).toContain('placeholder = "Тула, Тульская область"');
    expect(locationInput).toContain("placeholder?: string");
    expect(locationInput).toContain("placeholder={placeholder}");
    expect(locationInput).toContain("Начните вводить город и выберите вариант с регионом. Можно также указать координаты.");
    expect(locationInput).not.toContain("Данные GeoNames");
    expect(locationInput).not.toContain("geonames.org");
  });
});
