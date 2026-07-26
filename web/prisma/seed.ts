import "dotenv/config";
import { db } from "../src/lib/db";
import { usersDb } from "../src/lib/users-db";
import bcrypt from "bcryptjs";
import { Specialty } from "@prisma/client";
import { generateUniqueSlug } from "../src/lib/slug";
import {
  DEMO_PROFILE_VERIFIED_AT,
  demoSeedPractitionerStatus,
  demoSeedPractitionerVerified,
  isDemoAccountEmail,
} from "../src/lib/demo-catalog";

async function main() {
  console.log("🌱 Seeding test accounts...");

  // Базовые тестовые аккаунты (client, practitioner) через usersDb
  await usersDb.seedTestAccounts();
  console.log("✅ Base test accounts seeded");

  // Дополнительные данные для тестового практика (если он уже создан seedTestAccounts)
  const practitionerEmail = "practitioner@test.eterapy.com";
  const user = await db.user.findUnique({ where: { email: practitionerEmail } });
  if (user) {
    const slug = await generateUniqueSlug(user.name, async (s) => {
      const exists = await db.practitioner.findUnique({ where: { slug: s } });
      return !!exists;
    });

    const practitioner = await db.practitioner.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        slug,
        // B588: статус из списка оставленных профилей. Елена в списке остаётся,
        // но захардкоженный "ACTIVE" тихо воскресил бы любого, кого уберут позже.
        status: demoSeedPractitionerStatus(practitionerEmail),
        title: "Астролог, нумеролог",
        bio: "Опытный практик с более чем 10-летним стажем.",
        experience: "10 лет",
        specialties: [Specialty.ASTROLOGY, Specialty.NUMEROLOGY],
        tags: ["астрология", "нумерология", "таро"],
        // B590: признаки проверки ETerapy ставятся из одного места вместе с
        // датой — «verified без verifiedAt» это половина признака.
        verified: demoSeedPractitionerVerified(practitionerEmail),
        verifiedAt: demoSeedPractitionerVerified(practitionerEmail) ? DEMO_PROFILE_VERIFIED_AT : null,
        // B584/B588: демо-профиль помечается флагом, и запись ему принудительно
        // НЕ открывается. B459 ставил здесь override ради живого каталога — это
        // и была причина, по которой к тестовым практикам можно было записаться.
        demoAccount: isDemoAccountEmail(practitionerEmail),
        bookingOverrideEnabled: false,
        bookingOverrideAt: null,
        pricePerSession: 3000,
        reviewCount: 15,
        ratingSum: 75,
        sessionCount: 120,
      },
      update: {
        status: demoSeedPractitionerStatus(practitionerEmail),
        verified: demoSeedPractitionerVerified(practitionerEmail),
        verifiedAt: demoSeedPractitionerVerified(practitionerEmail) ? DEMO_PROFILE_VERIFIED_AT : null,
        demoAccount: isDemoAccountEmail(practitionerEmail),
        bookingOverrideEnabled: false,
        bookingOverrideAt: null,
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
    // Расписание (пн-пт 9:00-21:00). B584/B588: у демо-профиля правила остаются
    // выключенными — сид не открывает расписание, закрытое владельцем.
    const days = [1, 2, 3, 4, 5];
    const scheduleEnabled = !isDemoAccountEmail(practitionerEmail);
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
          enabled: scheduleEnabled,
        },
        update: { enabled: scheduleEnabled, startHour: 9, startMinute: 0, endHour: 21, endMinute: 0 },
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
    { email: "numerology@test.eterapy.com", name: "Светлана Цифер", specialties: [Specialty.NUMEROLOGY], price: 2000 },
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
      const practSlug = await generateUniqueSlug(newUser.name, async (s) => {
        const exists = await db.practitioner.findUnique({ where: { slug: s } });
        return !!exists;
      });
      const pract = await db.practitioner.create({
        data: {
          userId: newUser.id,
          slug: practSlug,
          status: demoSeedPractitionerStatus(p.email),
          title: p.specialties.includes(Specialty.ASTROLOGY) ? "Астролог" : p.specialties.includes(Specialty.TAROT) ? "Таролог" : "Эзотерик",
          bio: "Опытный практик.",
          experience: "5 лет",
          specialties: p.specialties,
          tags: p.specialties.map(s => s.toLowerCase()),
          verified: demoSeedPractitionerVerified(p.email),
          verifiedAt: demoSeedPractitionerVerified(p.email) ? DEMO_PROFILE_VERIFIED_AT : null,
          demoAccount: isDemoAccountEmail(p.email),
          bookingOverrideEnabled: false,
          bookingOverrideAt: null,
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
            enabled: !isDemoAccountEmail(p.email),
          },
        });
      }
      console.log(`✅ Created practitioner: ${p.email}`);
    } else {
      // Fix slug for existing practitioners that still have 'pending'
      const existingPract = await db.practitioner.findUnique({ where: { userId: existing.id } });
      if (existingPract && (existingPract.slug === "pending" || !existingPract.slug)) {
        const newSlug = await generateUniqueSlug(existing.name, async (s) => {
          const ex = await db.practitioner.findUnique({ where: { slug: s } });
          return !!ex;
        });
        await db.practitioner.update({
          where: { id: existingPract.id },
          data: { slug: newSlug },
        });
        console.log(`✅ Fixed slug for ${existing.name}: ${newSlug}`);
      }
    }
  }

  // Админы

  // Fix ALL practitioners with pending/empty slugs
  const pendingPracts = await db.practitioner.findMany({
    where: { OR: [{ slug: "pending" }, { slug: "" }] },
    include: { user: { select: { name: true } } },
  });
  for (const pp of pendingPracts) {
    const newSlug = await generateUniqueSlug(pp.user.name, async (s) => {
      const ex = await db.practitioner.findUnique({ where: { slug: s } });
      return !!ex;
    });
    await db.practitioner.update({
      where: { id: pp.id },
      data: { slug: newSlug },
    });
    console.log(`✅ Fixed slug for ${pp.user.name}: ${newSlug}`);
  }
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
