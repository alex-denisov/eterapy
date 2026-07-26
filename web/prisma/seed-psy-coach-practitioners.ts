/**
 * B457 (walkthrough item 8): seed demo PSYCHOLOGY + COACHING specialists so the
 * default «Психология и коучинг» tab is not empty. The prod/staging catalog only
 * had esoteric demos. Idempotent — upserts by email / userId, rebuilds rates,
 * upserts the weekly schedule. Safe to re-run.
 *
 * Run: DATABASE_URL=... npx tsx prisma/seed-psy-coach-practitioners.ts
 */
import db from "../src/lib/db";
import { PractitionerStatus, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateUniqueSlug } from "../src/lib/slug";
import {
  DEMO_PROFILE_VERIFIED_AT,
  demoSeedPractitionerStatus,
  demoSeedPractitionerVerified,
  isDemoAccountEmail,
} from "../src/lib/demo-catalog";

interface DemoPractitioner {
  email: string;
  name: string;
  title: string;
  bio: string;
  experience: string;
  categories: string[];
  directions: string[];
  tags: string[];
  languages: string[];
  price: number;
  reviewCount: number;
  rating: number;
  sessionCount: number;
  // B459 (walkthrough item 15): true = verified + booking enabled via the superadmin
  // override (commercial requisites bypassed for demos). One demo is left false to
  // showcase the «Не верифицирован» + «запись скоро откроется» blocked state.
  bookingReady: boolean;
}

const DEMO: DemoPractitioner[] = [
  {
    email: "psy-cbt@test.eterapy.com",
    name: "Дарья Соколова",
    title: "Клинический психолог, КПТ-терапевт",
    bio: "Работаю в когнитивно-поведенческом подходе. Помогаю справиться с тревогой, паническими атаками и вернуть опору в себе.",
    experience: "9 лет",
    categories: ["psychology"],
    directions: ["cbt", "schema"],
    tags: ["Тревога", "Панические атаки", "Самооценка"],
    languages: ["Русский", "English"],
    price: 3500,
    reviewCount: 38,
    rating: 4.9,
    sessionCount: 210,
    bookingReady: true,
  },
  {
    email: "psy-gestalt@test.eterapy.com",
    name: "Анна Лебедева",
    title: "Психолог, гештальт-терапевт",
    bio: "Гештальт-подход о настоящем: про чувства, контакт и выбор. Помогаю с отношениями, выгоранием и хроническим стрессом.",
    experience: "7 лет",
    categories: ["psychology"],
    directions: ["gestalt"],
    tags: ["Отношения", "Выгорание", "Стресс"],
    languages: ["Русский"],
    price: 3000,
    reviewCount: 26,
    rating: 4.8,
    sessionCount: 150,
    bookingReady: true,
  },
  {
    email: "psy-family@test.eterapy.com",
    name: "Марина Озерова",
    title: "Семейный психотерапевт",
    bio: "Системная семейная терапия. Работаю с парами и родителями: кризисы отношений, развод, детско-родительские конфликты.",
    experience: "11 лет",
    categories: ["psychology"],
    directions: ["family-systems"],
    tags: ["Отношения", "Развод", "Детско-родительские отношения"],
    languages: ["Русский"],
    price: 4000,
    reviewCount: 41,
    rating: 4.9,
    sessionCount: 260,
    bookingReady: true,
  },
  {
    email: "psy-emdr@test.eterapy.com",
    name: "Ольга Зайцева",
    title: "Психолог, работа с травмой (EMDR)",
    bio: "Бережно работаю с последствиями травматичного опыта и утратой через EMDR и телесные практики. Возвращаю чувство безопасности.",
    experience: "8 лет",
    categories: ["psychology"],
    directions: ["emdr", "body"],
    tags: ["Психотравма", "Утрата и горе", "Тревога"],
    languages: ["Русский"],
    price: 3800,
    reviewCount: 19,
    rating: 4.8,
    sessionCount: 110,
    bookingReady: true,
  },
  {
    email: "coach-career@test.eterapy.com",
    name: "Сергей Орлов",
    title: "Карьерный коуч",
    bio: "Помогаю выбрать направление, пройти смену профессии и выйти из выгорания без потери себя. Конкретные шаги, а не общие советы.",
    experience: "6 лет",
    categories: ["coaching"],
    directions: ["career"],
    tags: ["Карьера", "Смена профессии", "Выгорание"],
    languages: ["Русский", "English"],
    price: 3200,
    reviewCount: 22,
    rating: 4.7,
    sessionCount: 130,
    bookingReady: true,
  },
  {
    email: "coach-life@test.eterapy.com",
    name: "Екатерина Власова",
    title: "Лайф-коуч",
    bio: "Лайф-коучинг про цели, мотивацию и баланс. Помогаю расставить приоритеты и принимать решения, в которых вы уверены.",
    experience: "5 лет",
    categories: ["coaching"],
    directions: ["life", "transformational"],
    tags: ["Цели и мотивация", "Баланс работы и жизни", "Принятие решений"],
    languages: ["Русский"],
    price: 2800,
    reviewCount: 17,
    rating: 4.8,
    sessionCount: 90,
    // B459: left unverified + booking-blocked on purpose — demonstrates the
    // «Не верифицирован» badge and the «запись скоро откроется» notice.
    bookingReady: false,
  },
];

async function main() {
  console.log("🌱 Seeding psychology + coaching demo practitioners…");

  for (const d of DEMO) {
    const password = await bcrypt.hash("test1234", 10);
    const user = await db.user.upsert({
      where: { email: d.email },
      create: {
        email: d.email,
        name: d.name,
        password,
        role: Role.PRACTITIONER,
        emailVerified: true,
        provider: "web",
      },
      update: { name: d.name },
    });

    const existing = await db.practitioner.findUnique({ where: { userId: user.id } });
    const slug =
      existing?.slug && existing.slug !== "pending"
        ? existing.slug
        : await generateUniqueSlug(d.name, async (s) => {
            const ex = await db.practitioner.findUnique({ where: { slug: s } });
            return !!ex && ex.userId !== user.id;
          });

    const practitioner = await db.practitioner.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        slug,
        // B588: статус берётся из списка оставленных профилей, а не «ACTIVE»
        // безусловно — иначе повторный прогон сида вернул бы в каталог
        // отключённые владельцем профили.
        status: demoSeedPractitionerStatus(d.email) as PractitionerStatus,
        title: d.title,
        bio: d.bio,
        experience: d.experience,
        categories: d.categories,
        directions: d.directions,
        specialties: [],
        tags: d.tags,
        languages: d.languages,
        // B590: оставленным профилям — полный набор признаков проверки ETerapy
        // (с датой). `bookingReady` описывал коммерческую готовность и к
        // проверке отношения не имел; запись всё равно закрыта `demoAccount`.
        verified: demoSeedPractitionerVerified(d.email),
        verifiedAt: demoSeedPractitionerVerified(d.email) ? DEMO_PROFILE_VERIFIED_AT : null,
        // B588: сид обязан помечать демо-профиль (B584 ввёл флаг, но сид его
        // не ставил — новый сидированный профиль выходил «живым»), и не
        // открывать ему запись принудительно.
        demoAccount: isDemoAccountEmail(d.email),
        bookingOverrideEnabled: false,
        bookingOverrideAt: null,
        pricePerSession: d.price,
        reviewCount: d.reviewCount,
        ratingSum: Math.round(d.rating * d.reviewCount * 10) / 10,
        sessionCount: d.sessionCount,
      },
      update: {
        slug,
        // B588: статус берётся из списка оставленных профилей, а не «ACTIVE»
        // безусловно — иначе повторный прогон сида вернул бы в каталог
        // отключённые владельцем профили.
        status: demoSeedPractitionerStatus(d.email) as PractitionerStatus,
        title: d.title,
        bio: d.bio,
        experience: d.experience,
        categories: d.categories,
        directions: d.directions,
        specialties: [],
        tags: d.tags,
        languages: d.languages,
        // B590: оставленным профилям — полный набор признаков проверки ETerapy
        // (с датой). `bookingReady` описывал коммерческую готовность и к
        // проверке отношения не имел; запись всё равно закрыта `demoAccount`.
        verified: demoSeedPractitionerVerified(d.email),
        verifiedAt: demoSeedPractitionerVerified(d.email) ? DEMO_PROFILE_VERIFIED_AT : null,
        // B588: сид обязан помечать демо-профиль (B584 ввёл флаг, но сид его
        // не ставил — новый сидированный профиль выходил «живым»), и не
        // открывать ему запись принудительно.
        demoAccount: isDemoAccountEmail(d.email),
        bookingOverrideEnabled: false,
        bookingOverrideAt: null,
        pricePerSession: d.price,
        reviewCount: d.reviewCount,
        ratingSum: Math.round(d.rating * d.reviewCount * 10) / 10,
        sessionCount: d.sessionCount,
      },
    });

    // Rates: rebuild the two enabled durations idempotently.
    await db.priceRate.deleteMany({ where: { practitionerId: practitioner.id } });
    await db.priceRate.createMany({
      data: [
        { practitionerId: practitioner.id, durationMin: 60, priceRub: d.price, enabled: true },
        { practitionerId: practitioner.id, durationMin: 90, priceRub: Math.round(d.price * 1.5), enabled: true },
      ],
    });

    // Weekly schedule (Mon–Sat, 10:00–20:00). B584/B588: у демо-профиля правила
    // создаются ВЫКЛЮЧЕННЫМИ — часы остаются на месте на случай появления живого
    // человека, но сид больше не открывает расписание, которое владелец закрыл.
    const scheduleEnabled = !isDemoAccountEmail(d.email);
    for (const day of [1, 2, 3, 4, 5, 6]) {
      await db.scheduleRule.upsert({
        where: { practitionerId_dayOfWeek: { practitionerId: practitioner.id, dayOfWeek: day } },
        create: {
          practitionerId: practitioner.id,
          dayOfWeek: day,
          startHour: 10,
          startMinute: 0,
          endHour: 20,
          endMinute: 0,
          enabled: scheduleEnabled,
        },
        update: { enabled: scheduleEnabled, startHour: 10, startMinute: 0, endHour: 20, endMinute: 0 },
      });
    }

    console.log(`  ✓ ${d.name} (${d.title}) → /practitioners/${slug}`);
  }

  console.log("✅ Psychology + coaching demo practitioners seeded");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect?.());
