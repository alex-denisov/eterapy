import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("B441 tarot + checkin follow-ups", () => {
  const actions = source("src/components/products/symbolic-product-actions.tsx");
  const checkin = source("src/app/checkin/page.tsx");
  const clarifier = source("src/lib/dialogue-clarifier.ts");
  const lib = source("src/lib/symbolic-products.ts");

  describe("#1 tarot result is session-scoped (not auto-loaded forever)", () => {
    it("does not auto-load the last tarot result on mount", () => {
      expect(actions).toContain('if (productKey !== "tarot")');
    });
    it("scopes the reading to a ?reading=<id> url param", () => {
      expect(actions).toContain('.get("reading")');
      expect(actions).toContain('searchParams.set("reading"');
      expect(actions).toContain('searchParams.delete("reading")');
    });
    it("exposes a GET-by-id endpoint that returns metadata", () => {
      const route = source("src/app/api/products/symbolic/[id]/route.ts");
      expect(route).toContain("export async function GET");
      expect(route).toContain("metadata: result.metadata");
    });
  });

  describe("#2 read-only recap on the result", () => {
    it("shows a read-only theme/spread/question recap", () => {
      expect(actions).toContain('data-testid="tarot-recap"');
      expect(actions).toContain('className="tarot-recap"');
    });
  });

  describe("#7 no duplicated meta pills", () => {
    it("removes the tarot-meta-pill row from the result summary", () => {
      expect(actions).not.toContain("tarot-meta-pill");
    });
  });

  describe("#8 digit spread labels", () => {
    it("labels spreads with digits in UI and presets", () => {
      expect(actions).toContain('label: "1 карта"');
      expect(actions).toContain('label: "3 карты"');
      expect(actions).not.toContain('label: "Одна карта"');
      expect(actions).not.toContain('label: "Три карты"');
      expect(lib).toContain('label: "1 карта"');
    });
  });

  describe("#9 checkin dialogue restored + robust", () => {
    it("clarifier asks heuristic questions to reach the 3–5 floor (never one-and-done)", () => {
      // Task 5: below MIN_CLARIFYING_TURNS, a failed/early turn must come back with
      // another heuristic question instead of jumping straight to the разбор.
      expect(clarifier).toContain("heuristicTurnAt");
      expect(clarifier).toContain("MIN_CLARIFYING_TURNS");
      expect(clarifier).toContain("canBeReady");
    });
    it("renders the original dialogue design via DialogueThread", () => {
      expect(checkin).toContain("DialogueThread");
      expect(source("src/components/dialogue/dialogue-thread.tsx")).toContain("soft-msg-bubble");
    });
    it("toggles показать/скрыть диалог", () => {
      expect(checkin).toContain("скрыть диалог");
      expect(checkin).toContain("показать диалог");
      expect(checkin).toContain("setHistoryOpen");
    });
  });

  describe("#10 checkin result actions", () => {
    it("uses the shared AutosavedNote and drops share + new-question", () => {
      expect(checkin).toContain("AutosavedNote");
      expect(checkin).not.toContain("AIShareButton");
      expect(checkin).not.toContain("Новый вопрос");
    });
  });
});
