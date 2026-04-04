/** Тип практика из API — используется на клиентских страницах */
export interface PractitionerData {
  id: string;
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

export const SPECIALTY_LABELS: Record<string, string> = {
  TAROT: "Таро",
  ASTROLOGY: "Астрология",
  NUMEROLOGY: "Нумерология",
  PSYCHIC: "Ясновидение",
  RUNES: "Руны",
  DREAMS: "Сновидения",
};
