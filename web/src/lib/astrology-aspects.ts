import type { ChartPlacement } from "@/lib/esoteric-chart";

export type AstrologyAspectKind =
  | "conjunction"
  | "sextile"
  | "square"
  | "trine"
  | "opposition";

export type AstrologyAspectDefinition = {
  kind: AstrologyAspectKind;
  label: string;
  angle: number;
  natalOrb: number;
  synastryOrb: number;
  color: string;
  dash?: string;
};

// B506/B507: aspect colour is semantic, not decorative. The same definitions
// drive calculation, SVG and the visible legend so the screen cannot drift.
export const MAJOR_ASTROLOGY_ASPECTS: readonly AstrologyAspectDefinition[] = [
  { kind: "conjunction", label: "Соединение", angle: 0, natalOrb: 8, synastryOrb: 6, color: "#B7832F" },
  { kind: "sextile", label: "Секстиль", angle: 60, natalOrb: 5, synastryOrb: 4, color: "#2E8790" },
  { kind: "square", label: "Квадрат", angle: 90, natalOrb: 7, synastryOrb: 5, color: "#C54A45" },
  { kind: "trine", label: "Трин", angle: 120, natalOrb: 7, synastryOrb: 5, color: "#356FA8" },
  { kind: "opposition", label: "Оппозиция", angle: 180, natalOrb: 8, synastryOrb: 6, color: "#A92F43", dash: "10 5" },
] as const;

export type CalculatedAstrologyAspect = AstrologyAspectDefinition & {
  separation: number;
  orb: number;
};

export function astrologyAngleDelta(a: number, b: number) {
  const raw = Math.abs((((a - b) % 360) + 360) % 360);
  return raw > 180 ? 360 - raw : raw;
}

export function calculateAstrologyAspect(a: number, b: number, mode: "natal" | "compatibility-by-date") {
  const separation = astrologyAngleDelta(a, b);
  return MAJOR_ASTROLOGY_ASPECTS
    .map((definition): CalculatedAstrologyAspect => ({
      ...definition,
      separation,
      orb: Math.abs(separation - definition.angle),
    }))
    .filter((candidate) => candidate.orb <= (mode === "natal" ? candidate.natalOrb : candidate.synastryOrb))
    .sort((left, right) => left.orb - right.orb)[0] ?? null;
}

export type AstrologyAspectLine = {
  from: ChartPlacement;
  to: ChartPlacement;
  aspect: CalculatedAstrologyAspect;
};

export function calculateNatalAspectLines(placements: ChartPlacement[]): AstrologyAspectLine[] {
  const lines: AstrologyAspectLine[] = [];
  for (let left = 0; left < placements.length; left += 1) {
    for (let right = left + 1; right < placements.length; right += 1) {
      const aspect = calculateAstrologyAspect(placements[left].angle, placements[right].angle, "natal");
      if (aspect) lines.push({ from: placements[left], to: placements[right], aspect });
    }
  }
  // SVG paints later elements on top. Render wider-orb testimony first so the
  // most exact aspects remain visually dominant instead of being covered.
  return lines.sort((a, b) => b.aspect.orb - a.aspect.orb);
}

export function calculateSynastryAspectLines(a: ChartPlacement[], b: ChartPlacement[]): AstrologyAspectLine[] {
  const lines: AstrologyAspectLine[] = [];
  for (const from of a) {
    for (const to of b) {
      const aspect = calculateAstrologyAspect(from.angle, to.angle, "compatibility-by-date");
      if (aspect) lines.push({ from, to, aspect });
    }
  }
  return lines.sort((left, right) => right.aspect.orb - left.aspect.orb);
}

export function astrologyAspectStroke(aspect: CalculatedAstrologyAspect) {
  if (aspect.orb <= 1) return { width: 2.2, opacity: 0.9 };
  if (aspect.orb <= 3) return { width: 1.6, opacity: 0.72 };
  return { width: 1.25, opacity: 0.5 };
}
