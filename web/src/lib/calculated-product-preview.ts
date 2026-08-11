import type { NatalWheel, SynastryWheel } from "@/lib/esoteric-chart";
import type { TarotCard } from "@/lib/tarot-deck";

export type NatalCalculatedPreview = { productKey: "natal-chart"; wheel: NatalWheel };
export type SynastryCalculatedPreview = { productKey: "compatibility-by-date"; wheel: SynastryWheel };
export type TarotCalculatedPreview = {
  productKey: "tarot";
  cards: TarotCard[];
  tarotSpread: { key: "one" | "three" | "celtic"; label: string; positions: string[] };
  tarotTheme: string;
  tarotDrawId: string;
};

export async function requestCalculatedPreview<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/products/calculated-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Не удалось выполнить расчёт");
  return payload as T;
}
