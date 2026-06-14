import { getV5Product, type V5ProductSlug } from "@/lib/v5-products";

// B395: единая система рекомендаций «следующего шага». После любого разбора
// пользователю предлагается ОДНА осмысленная следующая услуга, выбранная из
// контекста результата (а не случайная промо-плашка). Каждая услуга может
// объявить свой резолвер (chat-analysis — по тому, кто собеседник), а для
// остальных действует разумный дефолт. Имя/цена/ссылка берутся из каталога
// v5Products (единый источник правды по биллингу), поэтому рекомендация не
// может разойтись с реальной ценой.

export type RecommendationSignals = {
  /** chat-analysis: кто собеседник (партнёр, бывший(ая), родитель…). */
  contact?: string | null;
  /** chat-analysis: что человек сейчас чувствует. */
  emotion?: string | null;
  /** Произвольные сигналы конкретной услуги. */
  [key: string]: string | null | undefined;
};

export type NextStepRecommendation = {
  slug: V5ProductSlug;
  name: string;
  price: string;
  href: string;
  /** Почему именно этот следующий шаг — одна тёплая клиентская строка. */
  reason: string;
  /** Подпись над карточкой («что дальше»-настроение). */
  eyebrow: string;
  /** Текст кнопки. */
  cta: string;
};

type Pick = { slug: V5ProductSlug; reason: string; eyebrow?: string };
type Resolver = (signals: RecommendationSignals) => Pick;

function includesAny(value: string | null | undefined, needles: string[]): boolean {
  if (!value) return false;
  const haystack = value.toLowerCase();
  return needles.some((n) => haystack.includes(n));
}

// Разбор переписки → следующий шаг зависит от того, кто собеседник: разговор с
// партнёром логично продолжить вдвоём, тему из детства — родовым разбором,
// рабочий конфликт — структурным документом, а одиночный запрос — «Полной
// картиной».
const resolveChatAnalysis: Resolver = (signals) => {
  const contact = signals.contact ?? "";
  if (includesAny(contact, ["партн"])) {
    return {
      slug: "pair",
      eyebrow: "следующий шаг",
      reason: "Этот разговор стоит продолжить вдвоём: «Вместе» помогает сверить взгляды без обвинений.",
    };
  }
  if (includesAny(contact, ["родител", "мама", "отец", "семь"])) {
    return {
      slug: "family-scenarios",
      eyebrow: "следующий шаг",
      reason: "Похоже, тема тянется из семьи. «Семейные сценарии» бережно покажут, что повторяется в роду.",
    };
  }
  if (includesAny(contact, ["коллег", "начальник", "работ"])) {
    return {
      slug: "deep-report",
      eyebrow: "следующий шаг",
      reason: "Чтобы разобрать ситуацию по полочкам, «Подробный разбор» соберёт её в документ с выводами.",
    };
  }
  // бывший(ая), друг, другой и пустой контекст → углубиться в свой вопрос целиком.
  return {
    slug: "perspectives",
    eyebrow: "следующий шаг",
    reason: "Если хочется понять свой вопрос целиком — «Полная картина» разложит мысли, чувства и первый шаг.",
  };
};

const RESOLVERS: Partial<Record<string, Resolver>> = {
  "chat-analysis": resolveChatAnalysis,
};

// Дефолтный следующий шаг для услуг без собственного резолвера — чтобы система
// давала рекомендацию на ВСЕХ услугах. Резолверы можно добавлять по мере того,
// как каждая услуга получает свой экран результата.
const DEFAULT_NEXT: Partial<Record<string, Pick>> = {
  perspectives: {
    slug: "deep-report",
    eyebrow: "идём глубже",
    reason: "Готовы к глубине? «Подробный разбор» соберёт ситуацию в документ с выводами и планом.",
  },
  "deep-report": {
    slug: "pair",
    eyebrow: "следующий шаг",
    reason: "Если в теме есть второй человек — «Вместе» поможет посмотреть на неё с двух сторон.",
  },
  tarot: {
    slug: "natal-chart",
    eyebrow: "рядом по теме",
    reason: "Хочется системного языка вместо карты дня — «Натальная карта» покажет ваши акценты и зоны роста.",
  },
  "natal-chart": {
    slug: "human-design",
    eyebrow: "рядом по теме",
    reason: "Ещё один язык про вас: «Дизайн человека» подскажет, как вам легче принимать решения.",
  },
  numerology: {
    slug: "natal-chart",
    eyebrow: "рядом по теме",
    reason: "Для объёмного портрета добавьте астрологию — «Натальная карта» дополнит картину чисел.",
  },
  "human-design": {
    slug: "perspectives",
    eyebrow: "следующий шаг",
    reason: "Перенесите это знание на живой вопрос — «Полная картина» разложит конкретную ситуацию.",
  },
  "surname-story": {
    slug: "family-scenarios",
    eyebrow: "идём глубже",
    reason: "От истории фамилии — к живым повторам: «Семейные сценарии» бережно соберут родовую тему.",
  },
  "family-scenarios": {
    slug: "perspectives",
    eyebrow: "следующий шаг",
    reason: "Чтобы перенести это на сегодняшний вопрос — «Полная картина» разложит мысли, чувства и шаг.",
  },
  synastry: {
    slug: "pair",
    eyebrow: "следующий шаг",
    reason: "Перенесите звёздную картину в живой разговор — «Вместе» помогает сверить взгляды бережно.",
  },
  compatibility: {
    slug: "pair",
    eyebrow: "следующий шаг",
    reason: "Дальше — общий вопрос: «Вместе» собирает один тёплый итог для двоих.",
  },
  pair: {
    slug: "deep-report",
    eyebrow: "идём глубже",
    reason: "Для глубины по вашей части — «Подробный разбор» соберёт ситуацию в документ с выводами.",
  },
};

/**
 * Подобрать рекомендацию следующего шага для услуги. Возвращает null, если
 * подходящей рекомендации нет (например, услуга не настроена или совпала с самой
 * собой). Сигналы опциональны: без них берётся дефолт услуги.
 */
export function getNextStepRecommendation(
  productKey: string,
  signals: RecommendationSignals = {},
): NextStepRecommendation | null {
  const resolver = RESOLVERS[productKey];
  const picked = resolver ? resolver(signals) : DEFAULT_NEXT[productKey];
  if (!picked) return null;
  // Никогда не рекомендуем ту же самую услугу.
  if (picked.slug === productKey) return null;

  const product = getV5Product(picked.slug);
  if (!product) return null;

  return {
    slug: product.slug,
    name: product.name,
    price: product.price,
    href: product.route,
    reason: picked.reason,
    eyebrow: picked.eyebrow ?? "следующий шаг",
    cta: `Открыть «${product.name}»`,
  };
}
