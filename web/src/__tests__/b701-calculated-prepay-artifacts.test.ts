import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/products/calculated-preview/route";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

function previewRequest(body: Record<string, unknown>) {
  return new NextRequest("https://eterapy.com/api/products/calculated-preview", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.70" },
    body: JSON.stringify(body),
  });
}

describe("B701 — calculated artifacts before payment", () => {
  it("calculates a real natal wheel without auth, storage or LLM", async () => {
    const response = await POST(previewRequest({
      productKey: "natal-chart",
      birthData: "03.03.1988, 21:00, Кишинёв",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.wheel).toMatchObject({ kind: "natal", calculation: "ephemeris" });
    expect(payload.wheel.placements).toHaveLength(10);
  });

  it("draws the selected Tarot spread and returns the draw id that binds the paid reading", async () => {
    const tarotDrawId = "1f39b1f8-5472-4c69-bd3f-5e2344907ec7";
    const response = await POST(previewRequest({
      productKey: "tarot",
      userInput: "Стоит ли принимать новое предложение о работе?",
      tarotSpread: "three",
      tarotTheme: "Работа и призвание",
      tarotDrawId,
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.tarotDrawId).toBe(tarotDrawId);
    expect(payload.cards).toHaveLength(3);
    expect(payload.cards.map((card: { position: string }) => card.position)).toEqual(["Прошлое", "Настоящее", "Будущее"]);
  });

  it("calculates a real synastry wheel for two birth records", async () => {
    const response = await POST(previewRequest({
      productKey: "compatibility-by-date",
      userBirthData: "03.03.1988, 21:00, Кишинёв",
      partnerBirthData: "12.04.1992, 14:35, Москва",
    }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.wheel.kind).toBe("compatibility-by-date");
    expect(payload.wheel.a.placements).toHaveLength(10);
    expect(payload.wheel.b.placements).toHaveLength(10);
  });

  it("keeps calculation separate from billing and binds Tarot interpretation to the shown draw", () => {
    const previewRoute = source("src/app/api/products/calculated-preview/route.ts");
    const paidRoute = source("src/app/api/products/symbolic/route.ts");
    const generator = source("src/lib/symbolic-products.ts");

    expect(previewRoute).not.toContain('from "@/lib/auth"');
    expect(previewRoute).not.toContain('from "@/lib/db"');
    expect(previewRoute).not.toContain("aiComplete");
    expect(paidRoute).toContain("tarotDrawId: parsed.data.tarotDrawId");
    expect(generator).toContain("input.tarotDrawId ?? input.userId");
  });

  it("shows purchase only after a calculated artifact on all three product screens", () => {
    const natal = source("src/components/products/natal-chart-actions.tsx");
    const tarot = source("src/components/products/symbolic-product-actions.tsx");
    const synastry = source("src/components/products/compatibility-by-date-actions.tsx");

    expect(natal).toContain("Рассчитать колесо бесплатно");
    expect(natal).toContain("previewWheel ?");
    expect(tarot).toContain("Вытянуть карты бесплатно");
    expect(tarot).toContain("previewTarotCards ?");
    expect(synastry).toContain("Рассчитать карту пары бесплатно");
    expect(synastry).toContain("previewWheel ?");
  });
});
