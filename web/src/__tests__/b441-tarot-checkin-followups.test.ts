import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("B441 tarot + checkin follow-ups", () => {
  const actions = source("src/components/products/symbolic-product-actions.tsx");
  const checkin = source("src/components/dialogue/checkin-experience.tsx");
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
      expect(actions).toContain('data-testid="product-recap"');
      expect(actions).toContain('className="product-recap"');
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
    it("keeps the clarifier always-LLM with a 3–5 floor (no scripted/heuristic questions)", () => {
      // Issue #3: the floor is enforced by the LLM's own ready-gating
      // (canBeReady ↔ MIN_CLARIFYING_TURNS), NOT by injecting scripted heuristic
      // questions. On failure the turn resolves to ready, never a preset question.
      expect(clarifier).toContain("MIN_CLARIFYING_TURNS");
      expect(clarifier).toContain("canBeReady");
      expect(clarifier).not.toContain("heuristicTurnAt");
      expect(clarifier).toContain("READY_TURN");
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
