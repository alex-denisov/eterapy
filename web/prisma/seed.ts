import "dotenv/config";
import { db } from "../src/lib/db";
import { usersDb } from "../src/lib/users-db";
import bcrypt from "bcryptjs";
import { Specialty } from "@prisma/client";

async function main() {
  console.log("🌱 Seeding test accounts...");

  // Базовые тестовые аккаунты (client, practitioner) через usersDb
  await usersDb.seedTestAccounts();
  console.log("✅ Base test accounts seeded");

  // Дополнительные данные для тестового практика (если он уже создан seedTestAccounts)
  const practitionerEmail = "practitioner@test.eterapy.com";
  const user = await db.user.findUnique({ where: { email: practitionerEmail } });
  if (user) {
    const practitioner = await db.practitioner.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        status: "ACTIVE",
        title: "Астролог, нумеролог",
        bio: "Опытный практик с более чем 10-летним стажем.",
        experience: "10 лет",
        specialties: [Specialty.ASTROLOGY, Specialty.NUMEROLOGY],
        tags: ["астрология", "нумерология", "таро"],
        verified: true,
        pricePerSession: 3000,
        reviewCount: 15,
        ratingSum: 75,
        sessionCount: 120,
      },
      update: {
        status: "ACTIVE",
        verified: true,
      },
    });
    // Тарифы
    await db.priceRate.deleteMany({ where: { practitionerId: practitioner.id } });
    await db.priceRate.createMany({
      data: [
        { practitionerId: practitioner.id, durationMin: 60, priceRub: 3000, enabled: true },
        { practitionerId: practitioner.id, durationMin: 90, priceRub: 4500, enabled: true },
      ],
    });
    // Расписание (пн-пт 9:00-21:00)
    const days = [1, 2, 3, 4, 5];
    for (const day of days) {
      await db.scheduleRule.upsert({
        where: { practitionerId_dayOfWeek: { practitionerId: practitioner.id, dayOfWeek: day } },
        create: {
          practitionerId: practitioner.id,
          dayOfWeek: day,
          startHour: 9,
          startMinute: 0,
          endHour: 21,
          endMinute: 0,
          enabled: true,
        },
        update: { enabled: true, startHour: 9, startMinute: 0, endHour: 21, endMinute: 0 },
      });
    }
    console.log("✅ Practitioner data ensured for", practitionerEmail);
  }

  // Создаём 6 дополнительных тестовых практиков разных специализаций
  const testPractitioners: Array<{
    email: string;
    name: string;
    specialties: Specialty[];
    price: number;
  }> = [
    { email: "tarot@test.eterapy.com", name: "Мария Крошевская", specialties: [Specialty.TAROT], price: 2500 },
    { email: "astrology@test.eterapy.com", name: "Ирина Звездная", specialties: [Specialty.ASTROLOGY], price: 3500 },
    { email: "numerology@test.eterapy.com", name: "СветLanа Цифер", specialties: [Specialty.NUMEROLOGY], price: 2000 },
    { email: "psychic@test.eterapy.com", name: "Ольга Интуи", specialties: [Specialty.PSYCHIC], price: 4000 },
    { email: "runes@test.eterapy.com", name: "Татьяна Руническая", specialties: [Specialty.RUNES], price: 2200 },
    { email: "dreams@test.eterapy.com", name: "Анна Сновидящая", specialties: [Specialty.DREAMS], price: 2800 },
  ];

  for (const p of testPractitioners) {
    const existing = await db.user.findFirst({ where: { email: p.email } });
    if (!existing) {
      const hashed = await bcrypt.hash("test1234", 10);
      const newUser = await db.user.create({
        data: {
          email: p.email,
          name: p.name,
          password: hashed,
          role: "PRACTITIONER",
          emailVerified: true,
          provider: "web",
        },
      });
      const pract = await db.practitioner.create({
        data: {
          userId: newUser.id,
          status: "ACTIVE",
          title: p.specialties.includes(Specialty.ASTROLOGY) ? "Астролог" : p.specialties.includes(Specialty.TAROT) ? "Таролог" : "Эзотерик",
          bio: "Опытный практик.",
          experience: "5 лет",
          specialties: p.specialties,
          tags: p.specialties.map(s => s.toLowerCase()),
          verified: true,
          pricePerSession: p.price,
          reviewCount: 10,
          ratingSum: 50,
          sessionCount: 50,
        },
      });
      await db.priceRate.createMany({
        data: [
          { practitionerId: pract.id, durationMin: 60, priceRub: p.price, enabled: true },
          { practitionerId: pract.id, durationMin: 90, priceRub: Math.floor(p.price * 1.5), enabled: true },
        ],
      });
      for (const day of [1,2,3,4,5,6,0]) {
        await db.scheduleRule.create({
          data: {
            practitionerId: pract.id,
            dayOfWeek: day,
            startHour: 10,
            startMinute: 0,
            endHour: 20,
            endMinute: 0,
            enabled: true,
          },
        });
      }
      console.log(`✅ Created practitioner: ${p.email}`);
    }
  }

  // Админы
  const adminEmail = "admin@test.eterapy.com";
  const adminUser = await db.user.findFirst({ where: { email: adminEmail } });
  if (!adminUser) {
    const pwd = await bcrypt.hash("test1234", 10);
    await db.user.create({
      data: {
        email: adminEmail,
        name: "Тестовый Админ",
        password: pwd,
        role: "ADMIN",
        emailVerified: true,
      },
    });
    console.log("✅ Admin user created");
  }

  const superAdminEmail = "superadmin@test.eterapy.com";
  const superAdmin = await db.user.findFirst({ where: { email: superAdminEmail } });
  if (!superAdmin) {
    const pwd = await bcrypt.hash("test1234", 10);
    await db.user.create({
      data: {
        email: superAdminEmail,
        name: "Супер Админ",
        password: pwd,
        role: "SUPERADMIN",
        emailVerified: true,
      },
    });
    console.log("✅ SuperAdmin user created");
  }

  const modEmail = "moderator@test.eterapy.com";
  const modUser = await db.user.findFirst({ where: { email: modEmail } });
  if (!modUser) {
    const pwd = await bcrypt.hash("test1234", 10);
    await db.user.create({
      data: {
        email: modEmail,
        name: "Тестовый Модератор",
        password: pwd,
        role: "ADMIN",
        emailVerified: true,
      },
    });
    console.log("✅ Moderator user created (ADMIN role)");
  }

  console.log("✅ Done");
}

main().catch(console.error);
