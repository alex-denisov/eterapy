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
    // B665 · владелец 2026-08-05: профиль полностью переименован в реального
    // практика. Вымышленные отзывы и счётчики сессий убраны намеренно: под
    // демо-именем это была витрина, под именем живого человека это были бы
    // выдуманные отзывы о конкретном специалисте.
    id: "alisa-babaeva",
    name: "Алиса Бабаева",
    avatar: "🌙",
    title: "Таролог · Астролог · Нумеролог",
    specialties: ["tarot", "astrology", "numerology"],
    rating: 0,
    reviewCount: 0,
    sessionCount: 0,
    pricePerSession: 2000,
    bio: "Работаю с картами Таро, натальной картой и нумерологическим разбором. В консультации важен не прогноз, а опора: посмотреть на ситуацию со стороны и увидеть следующий шаг. Отдельно веду темы тревоги, отношений и выборов, из которых трудно выйти.",
    experience: "10 лет",
    languages: ["Русский"],
    verified: true,
    founding: true,
    online: false,
    nextSlot: null,
    tags: ["Отношения", "Самопознание", "Выборы"],
    reviews: [],
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
  {
    id: "tatyana-romanova",
    name: "Татьяна Романова",
    avatar: "🌿",
    title: "Астролог · Нумеролог",
    specialties: ["astrology", "numerology"],
    rating: 4.8,
    reviewCount: 76,
    sessionCount: 163,
    pricePerSession: 2800,
    bio: "Работаю с западной астрологией и нумерологией Шаньяпта. Специализируюсь на вопросах призвания, самопознания и выбора жизненного направления.",
    experience: "7 лет",
    languages: ["Русский"],
    verified: true,
    founding: false,
    online: true,
    nextSlot: "Завтра 16:00",
    tags: ["Призвание", "Самопознание", "Выбор"],
    reviews: [
      {
        author: "Екатерина М.",
        text: "Татьяна очень точно описала мою ситуацию, дала конкретные ориентиры на год вперёд.",
        rating: 5,
        date: "2026-04-10",
      },
      {
        author: "Антон Д.",
        text: "Полезная сессия, без пустых обещаний. Буду рекомендовать.",
        rating: 5,
        date: "2026-03-28",
      },
    ],
  },
  {
    id: "natalia-voloshina",
    name: "Наталья Волошина",
    avatar: "🔯",
    title: "Таролог",
    specialties: ["tarot"],
    rating: 4.9,
    reviewCount: 118,
    sessionCount: 247,
    pricePerSession: 3500,
    bio: "Таролог с 10-летним стажем, работаю с системой Таро Тота. Специализируюсь на вопросах отношений, деловых решений и личностного роста.",
    experience: "10 лет",
    languages: ["Русский", "English", "Deutsch"],
    verified: true,
    founding: true,
    online: true,
    nextSlot: "Сегодня 21:00",
    tags: ["Таро Тота", "Отношения", "Решения"],
    reviews: [
      {
        author: "Юлия С.",
        text: "Одна из лучших сессий за всё время. Наталья работает глубоко и без воды.",
        rating: 5,
        date: "2026-04-18",
      },
      {
        author: "Михаил Л.",
        text: "Очень точный расклад по рабочей ситуации. Всё сошлось.",
        rating: 5,
        date: "2026-04-05",
      },
      {
        author: "Виктория Р.",
        text: "Ценно, что не пугает и не давит. Работает по сути.",
        rating: 5,
        date: "2026-03-21",
      },
    ],
  },
  {
    id: "alexandr-kuznetsov",
    name: "Александр Кузнецов",
    avatar: "🌌",
    title: "Астролог",
    specialties: ["astrology"],
    rating: 4.7,
    reviewCount: 44,
    sessionCount: 91,
    pricePerSession: 4500,
    bio: "Ведический астролог, специализируюсь на натальных картах и прогнозировании ключевых периодов жизни. Особое внимание — карьере и финансам.",
    experience: "9 лет",
    languages: ["Русский"],
    verified: true,
    founding: false,
    online: false,
    nextSlot: "Послезавтра 12:00",
    tags: ["Ведическая астрология", "Карьера", "Финансы"],
    reviews: [
      {
        author: "Павел О.",
        text: "Очень детальный разбор натальной карты, многое открылось по-новому.",
        rating: 5,
        date: "2026-04-12",
      },
      {
        author: "Марина К.",
        text: "Хорошая консультация, цена соответствует качеству.",
        rating: 4,
        date: "2026-03-30",
      },
    ],
  },
  {
    id: "elena-kazakova",
    name: "Елена Казакова",
    avatar: "🕯️",
    title: "Руны · Сновидения",
    specialties: ["runes", "dreams"],
    rating: 4.8,
    reviewCount: 61,
    sessionCount: 128,
    pricePerSession: 2100,
    bio: "Работаю со старшим Футарком и юнгианским подходом к символике снов. Помогаю интерпретировать повторяющиеся сны и найти личное значение рунических посланий.",
    experience: "6 лет",
    languages: ["Русский"],
    verified: true,
    founding: false,
    online: true,
    nextSlot: "Завтра 19:00",
    tags: ["Руны", "Сны", "Символы"],
    reviews: [
      {
        author: "Анастасия П.",
        text: "Объяснила сон, который преследовал меня несколько месяцев. Стало намного легче.",
        rating: 5,
        date: "2026-04-15",
      },
      {
        author: "Роман В.",
        text: "Чёткий и глубокий разбор рун, без лишнего мистицизма.",
        rating: 5,
        date: "2026-04-01",
      },
    ],
  },
  {
    id: "irina-soboleva",
    name: "Ирина Соболева",
    avatar: "💜",
    title: "Нумеролог · Таролог",
    specialties: ["numerology", "tarot"],
    rating: 4.9,
    reviewCount: 93,
    sessionCount: 204,
    pricePerSession: 2600,
    bio: "Совмещаю нумерологию и Таро для комплексного взгляда на жизненную ситуацию. Особое направление — вопросы совместимости и выбора момента для важных шагов.",
    experience: "8 лет",
    languages: ["Русский", "English"],
    verified: true,
    founding: true,
    online: true,
    nextSlot: "Сегодня 17:30",
    tags: ["Совместимость", "Таро", "Нумерология"],
    reviews: [
      {
        author: "Дарья Н.",
        text: "Ирина дала очень объёмный взгляд на ситуацию через разные инструменты. Рекомендую.",
        rating: 5,
        date: "2026-04-20",
      },
      {
        author: "Сергей Т.",
        text: "Помогла определиться с датой важного события. Всё прошло хорошо.",
        rating: 5,
        date: "2026-04-08",
      },
    ],
  },
];
