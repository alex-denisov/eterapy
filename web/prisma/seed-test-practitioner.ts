import db from "../src/lib/db";
import { PractitionerStatus, Specialty } from "@prisma/client";

async function main() {
  const exists = await db.practitioner.findUnique({ where: { userId: "test-practitioner-001" } });
  if (exists) { console.log("Already exists:", exists.id); return; }

  const p = await db.practitioner.create({
    data: {
      id: "test-prac-001",
      userId: "test-practitioner-001",
      status: PractitionerStatus.ACTIVE,
      title: "Таролог · Астролог",
      bio: "Тестовый аккаунт практика. Специализация — таро и астрология.",
      experience: "8 лет",
      pricePerSession: 2500,
      languages: ["Русский", "English"],
      verified: true,
      founding: true,
      specialties: [Specialty.TAROT, Specialty.ASTROLOGY],
      tags: ["Отношения", "Карьера"],
      ratingSum: 720.3,
      reviewCount: 147,
      sessionCount: 312,
    }
  });
  console.log("Created:", p.id);
}
main().catch(console.error);
