import fs from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("B193 share/referral surfaces", () => {
  it("uses an anonymized Design v4 share card by default", () => {
    const component = source("src/components/ai-share-button.tsx");

    expect(component).toContain('data-testid="safe-share-card"');
    expect(component).toContain("const [hideQuestion, setHideQuestion] = useState(true)");
    expect(component).toContain("без имени, аватарки и исходного вопроса");
    expect(component).toContain("/share?from=");
    expect(component).not.toContain("APP_URL + \"/all-modalities\"");
  });

  it("adds a public share landing that keeps product entry question-first", () => {
    const page = source("src/app/share/page.tsx");
    const header = source("src/components/header.tsx");
    const footer = source("src/components/footer-conditional.tsx");

    expect(page).toContain('data-testid="public-share-landing"');
    expect(page).toContain('href={mainUrl("/all-modalities/checkin")}');
    expect(page).toContain("обезличены");
    expect(header).toContain('"/share"');
    expect(footer).toContain('"/share"');
  });
});
