import {
  analyzeSurname,
  parseSurnameInput,
  surnameFactsForAI,
  type SurnameStory,
} from "@/lib/surname-story";
import {
  V5_PRODUCT_PRICES_KOPECKS,
  V5_PRODUCT_CREDIT_COSTS,
  V5_LADDER_ACTIVE_PRODUCTS,
  getProductPriceLabel,
} from "@/lib/product-prices";
import { isSymbolicProductKey, getSymbolicProductDefinition, buildSymbolicProductTeaser } from "@/lib/symbolic-products";
import { getV5Product } from "@/lib/v5-products";
import { isKnownPaidProduct } from "@/lib/entitlements";
import { publicSeoRoutes } from "@/lib/seo";
import { shareText, ogImageUrl } from "@/lib/share";

// Слова-фатализмы, которых НЕ должно быть в бесплатной истории (родовая тема — это
// размышление, не судьба/карма/приговор рода).
const FATALISM = ["судьб", "карм", "приговор", "проклят", "обречен", "обречён"];

function noFatalism(text: string) {
  const lower = text.toLowerCase();
  for (const bad of FATALISM) expect(lower).not.toContain(bad);
}

describe("B391 surname morphology — origin classification", () => {
  it("patronymic -ов/-ев", () => {
    const story = analyzeSurname("Кузнецов")!;
    // «Кузнецов» содержит корень-занятие → классифицируется как профессиональная.
    expect(story.surname).toBe("Кузнецов");
    expect(story.originKind).toBe("occupational");
    expect(story.rootHint).toContain("кузнеч");
  });

  it("pure patronymic without occupation root", () => {
    const story = analyzeSurname("Петров")!;
    expect(story.originKind).toBe("patronymic");
    expect(story.regionHint).toBeTruthy();
  });

  it("locative -ский", () => {
    expect(analyzeSurname("Покровский")!.originKind).toBe("locative");
  });

  it("ukrainian -енко/-ук", () => {
    expect(analyzeSurname("Шевченко")!.originKind).toBe("west-slavic");
    expect(analyzeSurname("Ковальчук")!.originKind).toBe("occupational"); // коваль = кузнец
    expect(analyzeSurname("Бондарчук")!.originKind).toBe("occupational"); // бондар
  });

  it("caucasian -швили/-дзе/-ян", () => {
    expect(analyzeSurname("Гелашвили")!.originKind).toBe("caucasian");
    expect(analyzeSurname("Думбадзе")!.originKind).toBe("caucasian");
    expect(analyzeSurname("Петросян")!.originKind).toBe("caucasian");
  });

  it("northern -ых/-их", () => {
    expect(analyzeSurname("Седых")!.originKind).toBe("northern");
  });

  it("feminine endings classify like masculine", () => {
    expect(analyzeSurname("Соколова")!.originKind).toBe("patronymic");
    expect(analyzeSurname("Покровская")!.originKind).toBe("locative");
  });
});

describe("B391 parsing & robustness", () => {
  it("extracts surname from free text", () => {
    expect(parseSurnameInput("моя фамилия Кузнецова")).toBe("Кузнецова");
    expect(parseSurnameInput("Петров Иван Сергеевич")).toBe("Петров");
  });

  it("returns null for empty / non-cyrillic gibberish", () => {
    expect(parseSurnameInput("")).toBeNull();
    expect(parseSurnameInput("123 @@@")).toBeNull();
    expect(analyzeSurname("")).toBeNull();
  });

  it("is deterministic (stable share card)", () => {
    const a = JSON.stringify(analyzeSurname("Мельников"));
    const b = JSON.stringify(analyzeSurname("Мельников"));
    expect(a).toBe(b);
  });

  it("never produces fatalistic free output", () => {
    for (const name of ["Кузнецов", "Покровский", "Шевченко", "Гелашвили", "Седых", "Зимний"]) {
      const s = analyzeSurname(name)!;
      noFatalism(`${s.originStory} ${s.familyTheme} ${s.shareLine}`);
    }
  });
});

describe("B391 AI facts injection (paid разбор grounds on recognized form)", () => {
  it("surnameFactsForAI carries recognized form + no-fatalism instruction", () => {
    const story = analyzeSurname("Кузнецов") as SurnameStory;
    const facts = surnameFactsForAI(story);
    expect(facts).toContain("Кузнецов");
    expect(facts).toContain(story.originLabel);
    expect(facts.toLowerCase()).toContain("не подменяй");
    expect(facts.toLowerCase()).toContain("не переносить");
  });

  it("recognizes Рукосуев from the documented lexeme instead of the generic -ев suffix", () => {
    const story = analyzeSurname("Рукосуев")!;
    const facts = surnameFactsForAI(story);

    expect(story.originKind).toBe("descriptive");
    expect(story.rootHint).toContain("рукосуй");
    expect(story.evidence?.historicalMentions.join(" ")).toContain("1712");
    expect(facts).toContain("Исходная лексема: «рукосуй»");
    expect(facts).not.toContain("основа/корень после снятия типового суффикса: «рукосу»");
  });

  it("free teaser uses the recognized origin label", () => {
    const teaser = buildSymbolicProductTeaser({ productKey: "surname-story", userInput: "Кузнецов", generatedText: "" });
    expect(teaser).toContain("родовой разбор");
  });
});

describe("B391 product registration & pricing", () => {
  it("surname-story is a symbolic product with a definition", () => {
    expect(isSymbolicProductKey("surname-story")).toBe(true);
    expect(getSymbolicProductDefinition("surname-story")?.title).toBe("Тайна имени и фамилии");
  });

  it("is a known paid product priced 590 ₽ / 2 балла", () => {
    expect(isKnownPaidProduct("surname-story")).toBe(true);
    expect(V5_PRODUCT_PRICES_KOPECKS["surname-story"]).toBe(59000);
    expect(V5_PRODUCT_CREDIT_COSTS["surname-story"]).toBe(2);
    expect(getProductPriceLabel("surname-story")).toBe("590 ₽");
  });

  it("stays inside the B366 ₽/балл ladder band", () => {
    expect(V5_LADDER_ACTIVE_PRODUCTS).toContain("surname-story");
    const rubPerCredit = V5_PRODUCT_PRICES_KOPECKS["surname-story"] / 100 / V5_PRODUCT_CREDIT_COSTS["surname-story"];
    expect(rubPerCredit).toBeGreaterThanOrEqual(250);
    expect(rubPerCredit).toBeLessThanOrEqual(300);
  });

  it("has a catalog product entry deriving price from the single source", () => {
    const product = getV5Product("surname-story")!;
    expect(product.route).toBe("/products/surname-story");
    expect(product.price).toBe("590 ₽");
    expect(product.creditCost).toBe(2);
  });

  it("is a public, indexable route", () => {
    expect(publicSeoRoutes).toContain("/products/surname-story");
  });
});

describe("B391 viral surfaces", () => {
  it("share text + OG image cover the surname-story kind", () => {
    expect(shareText("surname-story", "Кузнецов — фамилия от кузнечного дела")).toContain("историю своей фамилии");
    expect(ogImageUrl("surname-story")).toBe("/api/og?kind=surname-story");
  });
});
