/** Тип практика из API — используется на клиентских страницах */
export interface PractitionerData {
  id: string;
  slug: string;
  name: string;
  title: string;
  bio: string;
  specialties: string[];
  tags: string[];
  experience: string;
  pricePerSession: number;
  languages: string[];
  verified: boolean;
  founding: boolean;
  rating: number;
  reviewCount: number;
  sessionCount: number;
  online: boolean;
  nextSlot: string | null;
  reviews?: Array<{
    author: string;
    rating: number;
    text: string | null;
    date: string;
  }>;
}

/**
 * V8: single source of truth for practitioner categories (the Prisma `Specialty`
 * enum). Every surface — practitioner profile editor, the admin user modal and
 * the public service cards — imports these labels/order so the taxonomy stays
 * in sync across the front-end, the DB and the superadmin panel.
 */
export type Specialty = "TAROT" | "ASTROLOGY" | "NUMEROLOGY" | "PSYCHIC" | "RUNES" | "DREAMS";

export const SPECIALTY_ORDER: Specialty[] = [
  "TAROT", "ASTROLOGY", "NUMEROLOGY", "PSYCHIC", "RUNES", "DREAMS",
];

export const SPECIALTY_LABELS: Record<string, string> = {
  TAROT: "Таро",
  ASTROLOGY: "Астрология",
  NUMEROLOGY: "Нумерология",
  PSYCHIC: "Экстрасенсорика",
  RUNES: "Руны",
  DREAMS: "Сновидения",
};

export const SPECIALTY_OPTIONS: Array<{ value: Specialty; label: string }> =
  SPECIALTY_ORDER.map((value) => ({ value, label: SPECIALTY_LABELS[value] }));
