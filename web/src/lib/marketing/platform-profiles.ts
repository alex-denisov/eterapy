/**
 * B705 — Канонические профили площадок под позиционирование Ани и воронку M26.
 *
 * Единый источник истины для оформления аккаунтов, био, закрепленных сообщений
 * и ссылок на всех 7 официальных площадках присутствия eTerapy.
 */

export interface PlatformProfile {
  platform: string;
  displayName: string;
  handleOrChannel: string;
  tagline: string;
  bio: string;
  targetLink: string;
  formatSummary: string;
  guidelines: readonly string[];
}

export const PLATFORM_PROFILES: Record<string, PlatformProfile> = {
  telegram: {
    platform: "telegram",
    displayName: "Аня · eTerapy",
    handleOrChannel: "@eterapy",
    tagline: "Куратор eTerapy. Помогаю находить ясность в переписках и отношениях.",
    bio: "Куратор eTerapy Аня (28 лет). Разбираем реальные жизненные ситуации, молчание в диалогах и сложные выборы. Без белого пальто, менторства и эзотерики.",
    targetLink: "https://t.me/eterapy_bot/app?startapp=pair",
    formatSummary: "Хук ситуации (<50 знаков) -> Скрытый мотив -> Зеркало -> Telegram Mini App",
    guidelines: [
      "Текст от первого лица Ани или объективный разбор ситуации",
      "Обязательный хук в первой строке",
      "Призыв ведет в Telegram Mini App бота @eterapy_bot",
    ],
  },
  instagram: {
    platform: "instagram",
    displayName: "Аня из eTerapy",
    handleOrChannel: "@eterapy",
    tagline: "Разбираем, что на самом деле скрывается за переписками.",
    bio: "Разбираем реальные переписки и скрытые мотивы.\nКо мне приходят, когда сложно понять человека.\nБесплатный разбор ситуации 👇",
    targetLink: "https://eterapy.com/s/instagram/pair",
    formatSummary: "Карусели, чат-мокапы 4:5, ссылка в био /s/instagram/pair",
    guidelines: [
      "Ссылки в тексте не кликабельны — направлять на ссылку в шапке профиля",
      "Не использовать маркировку is_ai_generated",
      "Очистка метаданных EXIF/C2PA у картинок перед публикацией",
    ],
  },
  threads: {
    platform: "threads",
    displayName: "Аня · eTerapy",
    handleOrChannel: "@eterapy",
    tagline: "О том, что люди не решаются сказать прямо в переписках.",
    bio: "Куратор eTerapy Аня (28 лет). Говорю о том, что люди не решаются сказать прямо в переписках. Вопросы и разборы без белого пальто.",
    targetLink: "https://eterapy.com/s/threads/pair",
    formatSummary: "Короткие треды до 480 знаков, без рекламного CTA, максимальный фокус на шер-способность",
    guidelines: [
      "Прямые рекламные CTA и ссылки пессимизируются алгоритмом Threads — ctaPolicy discouraged",
      "Символ длинного тире «—» запрещен: человек вводит обычный дефис «-»",
      "Острый вопрос в конце для обсуждения в комментариях",
    ],
  },
  vk: {
    platform: "vk",
    displayName: "eTerapy | Психология отношений и разбор переписок",
    handleOrChannel: "public225678123",
    tagline: "Понимаем человека по его сообщениям.",
    bio: "Разбираем, что на самом деле скрывается за молчанием, двойными сигналами и сложными сообщениями. Бесплатный разбор диалога в приложении.",
    targetLink: "https://eterapy.com/s/vk/pair",
    formatSummary: "Посты на стену до 1400 знаков с обложкой или чат-мокапом",
    guidelines: [
      "Ссылки разрешены, канонический формат /s/vk/...",
      "Уважительный, глубокий тон без панибратства",
    ],
  },
  max: {
    platform: "max",
    displayName: "eTerapy",
    handleOrChannel: "id774315089677_biz",
    tagline: "Сервис психологической ясности в отношениях.",
    bio: "Сервис психологической ясности в отношениях и сложных выборах. Разборы переписок и Mini App прямо внутри мессенджера.",
    targetLink: "https://eterapy.com/s/max/pair",
    formatSummary: "HTML-сообщения до 2500 знаков с картинкой, зеркалирование из Telegram",
    guidelines: [
      "Зеркалирование лучших постов из Telegram через Russian Trusted Root CA",
      "Ссылки через /s/max/...",
    ],
  },
  dzen: {
    platform: "dzen",
    displayName: "eTerapy: Психология диалога",
    handleOrChannel: "dzen.ru/eterapy",
    tagline: "Глубокие разборы коммуникации и отношений.",
    bio: "Глубокие разборы коммуникации, проективные методики и поиск ясности в отношениях от команды eTerapy.",
    targetLink: "https://eterapy.com/s/dzen/pair",
    formatSummary: "Статьи 3000-6000 знаков с подзаголовками каждые 900 знаков",
    guidelines: [
      "Автотипографика Дзена расставляет длинное тире «—»",
      "Не допускать дублирования слагов и повтора тем в 14-дневном окне",
    ],
  },
};

export function platformProfile(platform: string): PlatformProfile {
  return PLATFORM_PROFILES[platform.trim().toLowerCase()] ?? {
    platform,
    displayName: "eTerapy",
    handleOrChannel: "@eterapy",
    tagline: "Психологическая ясность",
    bio: "Психологическая ясность и разбор переписок.",
    targetLink: `https://eterapy.com/s/${encodeURIComponent(platform)}/pair`,
    formatSummary: "Стандартный пост",
    guidelines: [],
  };
}
