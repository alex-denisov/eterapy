import { TAROT_DECK, type TarotDeckCard } from "@/lib/tarot-deck";

export const TAROT_BIRTH_CODE_METHOD = "tarot-school-birth-cards-v1";

export type TarotBirthPosition = {
  key: "birth-card" | "soul-card";
  label: string;
  energy: number;
  formula: string;
  card: TarotDeckCard;
};

export type TarotBirthCode = {
  method: typeof TAROT_BIRTH_CODE_METHOD;
  birth: { day: number; month: number; year: number };
  total: number;
  positions: TarotBirthPosition[];
};

function majorCard(energy: number) {
  const index = energy === 22 ? 0 : energy;
  return TAROT_DECK.find((card) => card.arcana === "major" && card.code === `major-${String(index).padStart(2, "0")}`)!;
}

function reduceBirthTotal(total: number) {
  let value = total;
  while (value > 22) value = Math.floor(value / 10) + (value % 10);
  return value === 0 ? 22 : value;
}

function digitSum(value: number) {
  return String(value).split("").reduce((sum, digit) => sum + Number(digit), 0);
}

// Tarot School Birth Cards: MM + DD + century + YY, затем трёхзначную сумму
// сводим как первые две цифры + последняя (113 → 11 + 3 = 14). Вторая карта
// получается суммой цифр первой. Это существующая публичная система, а не
// собственная шестипозиционная механика ETerapy.
export function computeTarotBirthCode(day: number, month: number, birthYear: number, _legacyReferenceYear?: number): TarotBirthCode {
  const century = Math.floor(birthYear / 100);
  const yearPart = birthYear % 100;
  const total = month + day + century + yearPart;
  const birthEnergy = reduceBirthTotal(total);
  const soulEnergy = digitSum(birthEnergy);
  const positions: TarotBirthPosition[] = [
    {
      key: "birth-card",
      label: "Карта рождения",
      energy: birthEnergy,
      formula: `${String(month).padStart(2, "0")} + ${String(day).padStart(2, "0")} + ${century} + ${String(yearPart).padStart(2, "0")} = ${total} → ${birthEnergy}`,
      card: majorCard(birthEnergy),
    },
  ];
  if (soulEnergy !== birthEnergy) {
    positions.push({
      key: "soul-card",
      label: "Карта души",
      energy: soulEnergy,
      formula: `${String(birthEnergy).split("").join(" + ")} = ${soulEnergy}`,
      card: majorCard(soulEnergy),
    });
  }
  return {
    method: TAROT_BIRTH_CODE_METHOD,
    birth: { day, month, year: birthYear },
    total,
    positions,
  };
}
