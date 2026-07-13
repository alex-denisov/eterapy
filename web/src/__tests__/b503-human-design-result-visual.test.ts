import fs from "node:fs";
import path from "node:path";
import { computeHumanDesign } from "@/lib/human-design";
import { humanDesignSectionHeadings, personalizeHumanDesignResultHeadings } from "@/lib/human-design-result";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("B503 Human Design result visual and structure", () => {
  const chart = computeHumanDesign(new Date("1988-03-03T18:00:00.000Z"), true);

  it("matches the owner reference headline facts and Variable anchors", () => {
    expect(chart).toEqual(expect.objectContaining({
      typeName: "Манифестор",
      authorityName: "Эмоциональный авторитет",
      profile: "3/5",
      definition: "Раздвоенное определение",
    }));
    expect(chart.variables).toEqual({
      determination: { color: 2, tone: 4, direction: "right" },
      environment: { color: 5, tone: 1, direction: "left" },
      motivation: { color: 1, tone: 6, direction: "right" },
      perspective: { color: 3, tone: 5, direction: "right" },
    });
  });

  it("builds separate personalized headings for all five primary facts", () => {
    const headings = humanDesignSectionHeadings(chart);
    expect(headings[0]).toBe(`Тип — ${chart.typeName}`);
    expect(headings[1]).toBe(`Стратегия — ${chart.strategy}`);
    expect(headings[2]).toBe(`Авторитет — ${chart.authorityName}`);
    expect(headings[3]).toContain(`Профиль — ${chart.profile}`);
    expect(headings[4]).toBe(`Определение — ${chart.definition}`);
    expect(headings).toEqual(expect.arrayContaining([
      expect.stringMatching(/^Определённые центры — \d+$/),
      expect.stringMatching(/^Открытые центры — \d+$/),
      ...chart.definedChannels.map((channel) => expect.stringMatching(new RegExp(`^Канал ${channel.gates.join("–")} — `))),
      expect.stringMatching(/^Ворота — \d+ активных$/),
    ]));
  });

  it("personalizes headings on previously saved results", () => {
    const legacy = [
      "## Тип и стратегия",
      "Текст.",
      "## Внутренний авторитет",
      "Текст.",
      "## Профиль и роль",
      "Текст.",
      "## Как применять дизайн",
      "Текст.",
    ].join("\n");
    const personalized = personalizeHumanDesignResultHeadings(legacy, chart);
    expect(personalized).toContain(`## Тип — ${chart.typeName}; стратегия — ${chart.strategy}`);
    expect(personalized).toContain(`## Авторитет — ${chart.authorityName}`);
    expect(personalized).toContain(`## Профиль — ${chart.profile}: ${chart.profileName}`);
    expect(personalized).toContain(`## Практика — ${chart.strategy}; ${chart.authorityName}`);
  });

  it("renders five fact blocks and uses the approved amber/graphite channel rails", () => {
    const actions = source("src/components/products/human-design-actions.tsx");
    const bodygraph = source("src/components/products/human-design-bodygraph.tsx");
    expect(actions).toContain('data-testid="human-design-facts"');
    for (const label of ["тип", "стратегия", "авторитет", "профиль", "определение"]) {
      expect(actions).toContain(`label: "${label}"`);
    }
    expect(bodygraph).toContain('const DESIGN_COLOR = "#E69138"');
    expect(bodygraph).toContain('const PERSONALITY_COLOR = "#5D5448"');
    expect(bodygraph).toContain("#BodyGraphChart-Rounded ${cssAttrSelector(id)}");
    expect(bodygraph).toContain("if (design && personality)");
    expect(bodygraph).toContain("if (design) return");
    expect(bodygraph).toContain("if (personality) return");
  });
});
