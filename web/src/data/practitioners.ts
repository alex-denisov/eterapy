export type Specialty =
  | "tarot"
  | "astrology"
  | "numerology"
  | "psychic"
  | "runes"
  | "dreams";

export interface Review {
  author: string;
  text: string;
  rating: number;
  date: string;
}

export interface Practitioner {
  id: string;
  name: string;
  avatar: string; // emoji placeholder
  title: string;
  specialties: Specialty[];
  rating: number;
  reviewCount: number;
  sessionCount: number;
  pricePerSession: number; // RUB
  bio: string;
  experience: string; // "5 лет"
  languages: string[];
  verified: boolean;
  founding: boolean; // founding cohort — 15% commission
  online: boolean;
  nextSlot: string | null; // "Сегодня 18:00" | "Завтра 10:00" | null
  tags: string[];
  reviews: Review[];
}

export const SPECIALTY_LABELS: Record<Specialty, string> = {
  tarot: "Таро",
  astrology: "Астрология",
  numerology: "Нумерология",
  psychic: "Ясновидение",
  runes: "Руны",
  dreams: "Сновидения",
};

export const practitioners: Practitioner[] = [
  {
    id: "elena-morozova",
    name: "Елена Морозова",
    avatar: "🌙",
    title: "Таролог · Астролог",
    specialties: ["tarot", "astrology"],
    rating: 4.9,
    reviewCount: 147,
    sessionCount: 312,
    pricePerSession: 2500,
    bio: "Практикую таро и астрологию 8 лет. Специализируюсь на вопросах отношений и карьерных развилках. Работаю с колодой Райдера-Уэйта и ведической астрологией.",
    experience: "8 лет",
    languages: ["Русский", "English"],
    verified: true,
    founding: true,
    online: true,
    nextSlot: "Сегодня 18:00",
    tags: ["Отношения", "Карьера", "Самопознание"],
    reviews: [
      {
        author: "Анна К.",
        text: "Очень точный расклад, Елена попала в самую суть ситуации. Буду обращаться снова.",
        rating: 5,
        date: "2026-03-15",
      },
      {
        author: "Дмитрий П.",
        text: "Профессионально, без давления и запугивания. Дала конкретные советы.",
        rating: 5,
        date: "2026-03-08",
      },
      {
        author: "Мария С.",
        text: "Хорошая сессия, но немного затянулась по времени.",
        rating: 4,
        date: "2026-02-20",
      },
    ],
  },
  {
    id: "mikhail-volkov",
    name: "Михаил Волков",
    avatar: "⭐",
    title: "Астролог · Нумеролог",
    specialties: ["astrology", "numerology"],
    rating: 4.8,
    reviewCount: 89,
    sessionCount: 201,
    pricePerSession: 3000,
    bio: "Астролог с западной и ведической специализацией. Строю натальные карты, анализирую транзиты и прогрессии. Нумерология по системе Пифагора.",
    experience: "6 лет",
    languages: ["Русский"],
    verified: true,
    founding: true,
    online: false,
    nextSlot: "Завтра 11:00",
    tags: ["Натальная карта", "Транзиты", "Прогнозы"],
    reviews: [
      {
        author: "Ольга Т.",
        text: "Михаил очень подробно объяснил все аспекты карты. Узнала много нового о себе.",
        rating: 5,
        date: "2026-03-20",
      },
      {
        author: "Иван Р.",
        text: "Точный прогноз на год, сбылось уже несколько моментов.",
        rating: 5,
        date: "2026-03-01",
      },
    ],
  },
  {
    id: "sofia-belyaeva",
    name: "София Беляева",
    avatar: "🔮",
    title: "Таролог · Руны",
    specialties: ["tarot", "runes"],
    rating: 4.7,
    reviewCount: 63,
    sessionCount: 118,
    pricePerSession: 2000,
    bio: "Работаю с классическими раскладами Таро и скандинавскими рунами. Помогаю найти ответы в ситуациях неопределённости и принять сложные решения.",
    experience: "4 года",
    languages: ["Русский"],
    verified: true,
    founding: false,
    online: true,
    nextSlot: "Сегодня 20:00",
    tags: ["Решения", "Неопределённость", "Руны"],
    reviews: [
      {
        author: "Наталья В.",
        text: "София очень чуткий человек. Расклад был очень глубоким и помог разобраться в ситуации.",
        rating: 5,
        date: "2026-03-18",
      },
      {
        author: "Алексей М.",
        text: "Хорошая сессия, конкретные ответы без воды.",
        rating: 4,
        date: "2026-03-10",
      },
    ],
  },
  {
    id: "anna-sorokina",
    name: "Анна Сорокина",
    avatar: "✨",
    title: "Нумеролог",
    specialties: ["numerology"],
    rating: 4.9,
    reviewCount: 42,
    sessionCount: 87,
    pricePerSession: 1800,
    bio: "Специализируюсь на нумерологическом анализе личности и совместимости. Помогаю понять жизненный путь, сильные стороны и скрытые ресурсы.",
    experience: "3 года",
    languages: ["Русский", "English"],
    verified: true,
    founding: false,
    online: true,
    nextSlot: "Завтра 14:00",
    tags: ["Личность", "Совместимость", "Ресурсы"],
    reviews: [
      {
        author: "Ксения Л.",
        text: "Анна дала очень точный портрет, всё совпало. Буду рекомендовать.",
        rating: 5,
        date: "2026-03-22",
      },
    ],
  },
  {
    id: "igor-petrov",
    name: "Игорь Петров",
    avatar: "🌟",
    title: "Астролог",
    specialties: ["astrology"],
    rating: 4.6,
    reviewCount: 31,
    sessionCount: 54,
    pricePerSession: 2200,
    bio: "Работаю с западной астрологией, специализация — предсказательная астрология и выбор благоприятного времени для важных событий.",
    experience: "5 лет",
    languages: ["Русский"],
    verified: true,
    founding: false,
    online: false,
    nextSlot: null,
    tags: ["Прогнозы", "Timing", "События"],
    reviews: [
      {
        author: "Светлана Б.",
        text: "Помог выбрать дату для важного события. Всё прошло хорошо.",
        rating: 5,
        date: "2026-02-28",
      },
    ],
  },
  {
    id: "vera-nikolaeva",
    name: "Вера Николаева",
    avatar: "💫",
    title: "Таролог · Сновидения",
    specialties: ["tarot", "dreams"],
    rating: 4.8,
    reviewCount: 55,
    sessionCount: 110,
    pricePerSession: 2300,
    bio: "Таролог и исследователь символики сновидений. Помогаю расшифровать послания подсознания через карты и анализ снов.",
    experience: "5 лет",
    languages: ["Русский"],
    verified: true,
    founding: true,
    online: true,
    nextSlot: "Сегодня 19:30",
    tags: ["Сны", "Подсознание", "Символы"],
    reviews: [
      {
        author: "Полина К.",
        text: "Вера помогла понять повторяющийся сон, который меня беспокоил. Очень полезная сессия.",
        rating: 5,
        date: "2026-03-19",
      },
      {
        author: "Руслан О.",
        text: "Интересный подход, необычно и информативно.",
        rating: 5,
        date: "2026-03-05",
      },
    ],
  },
];
