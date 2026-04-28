/**
 * Seed практиков на основе моковых данных.
 * Запускать: DATABASE_URL=... npx tsx prisma/seed-practitioners.ts
 */
import db from "../src/lib/db";
import { PractitionerStatus, Specialty, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const practitioners = [
  {
    email: "elena@eterapy.com",
    name: "Елена Морозова",
    password: "practitioner_demo",
    role: Role.PRACTITIONER,
    emailVerified: true,
    practitioner: {
      status: PractitionerStatus.ACTIVE,
      title: "Таролог · Астролог",
      bio: "Практикую таро и астрологию 8 лет. Специализируюсь на вопросах отношений и карьерных развилках. Работаю с колодой Райдера-Уэйта и ведической астрологией.",
      experience: "8 лет",
      pricePerSession: 2500,
      languages: ["Русский", "English"],
      verified: true,
      founding: true,
      specialties: [Specialty.TAROT, Specialty.ASTROLOGY],
      tags: ["Отношения", "Карьера", "Самопознание"],
      ratingSum: 4.9 * 147,
      reviewCount: 147,
      sessionCount: 312,
    },
  },
  {
    email: "mikhail@eterapy.com",
    name: "Михаил Волков",
    password: "practitioner_demo",
    role: Role.PRACTITIONER,
    emailVerified: true,
    practitioner: {
      status: PractitionerStatus.ACTIVE,
      title: "Астролог · Нумеролог",
      bio: "Астролог с западной и ведической специализацией. Строю натальные карты, анализирую транзиты и прогрессии. Нумерология по системе Пифагора.",
      experience: "6 лет",
      pricePerSession: 3000,
      languages: ["Русский"],
      verified: true,
      founding: true,
      specialties: [Specialty.ASTROLOGY, Specialty.NUMEROLOGY],
      tags: ["Натальная карта", "Транзиты", "Прогнозы"],
      ratingSum: 4.8 * 89,
      reviewCount: 89,
      sessionCount: 201,
    },
  },
  {
    email: "sofia@eterapy.com",
    name: "София Беляева",
    password: "practitioner_demo",
    role: Role.PRACTITIONER,
    emailVerified: true,
    practitioner: {
      status: PractitionerStatus.ACTIVE,
      title: "Таролог · Руны",
      bio: "Работаю с классическими раскладами Таро и скандинавскими рунами. Помогаю найти ответы в ситуациях неопределённости и принять сложные решения.",
      experience: "4 года",
      pricePerSession: 2000,
      languages: ["Русский"],
      verified: true,
      founding: false,
      specialties: [Specialty.TAROT, Specialty.RUNES],
      tags: ["Решения", "Неопределённость", "Руны"],
      ratingSum: 4.7 * 63,
      reviewCount: 63,
      sessionCount: 118,
    },
  },
  {
    email: "anna@eterapy.com",
    name: "Анна Сорокина",
    password: "practitioner_demo",
    role: Role.PRACTITIONER,
    emailVerified: true,
    practitioner: {
      status: PractitionerStatus.ACTIVE,
      title: "Нумеролог",
      bio: "Специализируюсь на нумерологическом анализе личности и совместимости. Помогаю понять жизненный путь, сильные стороны и скрытые ресурсы.",
      experience: "3 года",
      pricePerSession: 1800,
      languages: ["Русский", "English"],
      verified: true,
      founding: false,
      specialties: [Specialty.NUMEROLOGY],
      tags: ["Личность", "Совместимость", "Ресурсы"],
      ratingSum: 4.9 * 42,
      reviewCount: 42,
      sessionCount: 87,
    },
  },
  {
    email: "igor@eterapy.com",
    name: "Игорь Петров",
    password: "practitioner_demo",
    role: Role.PRACTITIONER,
    emailVerified: true,
    practitioner: {
      status: PractitionerStatus.ACTIVE,
      title: "Астролог",
      bio: "Работаю с западной астрологией, специализация — предсказательная астрология и выбор благоприятного времени для важных событий.",
      experience: "5 лет",
      pricePerSession: 2200,
      languages: ["Русский"],
      verified: true,
      founding: false,
      specialties: [Specialty.ASTROLOGY],
      tags: ["Прогнозы", "Выбор времени", "События"],
      ratingSum: 4.6 * 31,
      reviewCount: 31,
      sessionCount: 54,
    },
  },
  {
    email: "vera@eterapy.com",
    name: "Вера Николаева",
    password: "practitioner_demo",
    role: Role.PRACTITIONER,
    emailVerified: true,
    practitioner: {
      status: PractitionerStatus.ACTIVE,
      title: "Таролог · Сновидения",
      bio: "Таролог и исследователь символики сновидений. Помогаю расшифровать послания подсознания через карты и анализ снов.",
      experience: "5 лет",
      pricePerSession: 2300,
      languages: ["Русский"],
      verified: true,
      founding: true,
      specialties: [Specialty.TAROT, Specialty.DREAMS],
      tags: ["Сны", "Подсознание", "Символы"],
      ratingSum: 4.8 * 55,
      reviewCount: 55,
      sessionCount: 110,
    },
  },
];

async function main() {
  console.log("🌱 Seeding practitioners...");

  for (const { practitioner: pData, ...userData } of practitioners) {
    const password = await bcrypt.hash(userData.password, 10);
    const user = await db.user.upsert({
      where: { email: userData.email },
      create: { ...userData, password, id: `practitioner-${userData.email.split("@")[0]}` },
      update: { name: userData.name, password },
    });

    await db.practitioner.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...pData },
      update: { ...pData },
    });

    console.log(`  ✓ ${userData.name}`);
  }

  console.log("✅ Practitioners seeded");
}

main().catch((e) => { console.error(e); process.exit(1); });
