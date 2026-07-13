import type { Metadata } from "next";
import { canonicalUrl, publicSeoRoutes, seoOrigins } from "@/lib/seo";

export type PublicSeoRoute = typeof publicSeoRoutes[number];

type SchemaKind = "WebPage" | "Article" | "FAQPage" | "Product";

type PublicPageSeo = {
  title: string;
  description: string;
  schemaKind: SchemaKind;
};

export const publicPageSeo: Record<PublicSeoRoute, PublicPageSeo> = {
  "/": {
    title: "ETerapy — вопрос, ясный ответ и бережный следующий шаг",
    description: "Задайте вопрос и получите структурированный первичный ответ. Если нужно глубже, ETerapy предложит отчет, маршрут или проверенного специалиста.",
    schemaKind: "WebPage",
  },
  "/about": {
    title: "О проекте ETerapy",
    description: "ETerapy строит этичную question-first платформу для самопознания, безопасных практик и прозрачной работы со специалистами.",
    schemaKind: "Article",
  },
  "/help": {
    title: "Помощь и вопросы — ETerapy",
    description: "Ответы на вопросы о регистрации, кабинетах, оплатах, сессиях, уведомлениях и работе практиков на ETerapy.",
    schemaKind: "FAQPage",
  },
  "/how-it-works": {
    title: "Как работает ETerapy",
    description: "Как работает ETerapy: вопрос, бесплатный первичный ответ, углубление по подписке или продукту и специалист только как осознанный следующий шаг.",
    schemaKind: "Article",
  },
  "/how-to-choose": {
    title: "Как выбрать практика — ETerapy",
    description: "Как безопасно выбрать таролога, астролога или нумеролога: цель запроса, профиль, отзывы, цена и красные флаги.",
    schemaKind: "Article",
  },
  "/pricing": {
    title: "Цены и тарифы ETerapy",
    description: "Прозрачные цены: бесплатный первичный ответ, разовые углубления, разбор переписки, совместимость, 7 дней и клиентские подписки.",
    schemaKind: "Product",
  },
  "/pricing/compare": {
    title: "Сравнение тарифов ETerapy",
    description: "Подробное сравнение Free, Plus и Premium: баллы, карта, цифровые продукты, маршруты, ограничения и что не входит в подписки.",
    schemaKind: "Product",
  },
  "/products/pair": {
    title: "Вместе — ETerapy",
    description: "Три формата разобраться вместе: взгляд со стороны от близкого по ссылке, сверить взгляды по согласию или посмотреть на совместимость. Начало бесплатно.",
    schemaKind: "Product",
  },
  "/telegram": {
    title: "ETerapy в Telegram",
    description: "Разбор, ежедневные карточки и мягкие напоминания ETerapy в Telegram с управлением приватностью.",
    schemaKind: "WebPage",
  },
  "/library": {
    title: "Библиотека анонимных вопросов — ETerapy",
    description: "Модерируемая SEO-библиотека обезличенных вопросов с короткими разборами, темами, реакциями и входом в персональный диалог.",
    schemaKind: "Article",
  },
  "/products": {
    title: "Услуги — ETerapy",
    description: "Цифровые углубления, совместные форматы, эзотерические разборы и встречи со специалистами. Начните с бесплатного первичного ответа или откройте нужную услугу сразу.",
    schemaKind: "Product",
  },
  "/products/reframe": {
    title: "Переосмысление — ETerapy",
    description: "Когнитивный рефрейминг одной ситуации: мысли против фактов, чувства, другой взгляд и первый шаг — все четыре угла под ваш запрос.",
    schemaKind: "Product",
  },
  "/products/deep-report": {
    title: "Подробный разбор — ETerapy",
    description: "Подробный структурный разбор вашей ситуации: что происходит, как это сложилось, что удерживает, на что опереться, сценарии и маршрут действий.",
    schemaKind: "Product",
  },
  "/products/chat-analysis": {
    title: "Разбор переписки — ETerapy",
    description: "Приватный анализ переписки с предупреждением о персональных данных, праве использования и удалении исходника.",
    schemaKind: "Product",
  },
  "/products/chat": {
    title: "Решить вопрос в чате — ETerapy",
    description: "Живой диалог 45 минут, чтобы разобрать вопрос в своём темпе. Платная синхронная услуга — продолжение бесплатного первичного разбора.",
    schemaKind: "Product",
  },
  "/products/tarot": {
    title: "Расклад Таро — продукт ETerapy",
    description: "Цифровой расклад Таро как язык метафор: без обещаний будущего, с приватным вопросом и практичным следующим шагом.",
    schemaKind: "Product",
  },
  "/products/natal-chart": {
    title: "Натальная карта — продукт ETerapy",
    description: "Астрологический разбор как символический портрет тем и фокусов, не предсказание и не приговор.",
    schemaKind: "Product",
  },
  "/products/synastry": {
    title: "Совместимость по звёздам — продукт ETerapy",
    description: "Сравнение двух натальных карт как символический язык динамики пары: ресурсы, разные ритмы и вопросы для точного разговора.",
    schemaKind: "Product",
  },
  "/products/numerology": {
    title: "Матрица судьбы — продукт ETerapy",
    description: "Матрица 22 энергий по дате рождения: предназначения, родовые линии, отношения, деньги, возрастные периоды и символическая карта энергий.",
    schemaKind: "Product",
  },
  "/products/horary": {
    title: "Хорарная астрология — ответ на вопрос — ETerapy",
    description: "Карта момента для одного точного вопроса: прямой эзотерический ответ, сигнификаторы, Луна, аспекты и противоречия.",
    schemaKind: "Product",
  },
  "/products/tarot-numerology": {
    title: "Арканы рождения по дате — карты Таро — ETerapy",
    description: "Карты рождения Таро по дате: постоянная пара Старших арканов — карта рождения и карта души — без случайной вытяжки.",
    schemaKind: "Product",
  },
  "/products/family-scenarios": {
    title: "Семейные сценарии — продукт ETerapy",
    description: "Бережная карта повторов рода: какие роли и темы передаются по семье и что можно мягко прервать. Без приговоров и диагнозов.",
    schemaKind: "Product",
  },
  "/products/human-design": {
    title: "Дизайн человека — узнать свой тип бесплатно — ETerapy",
    description: "Ваш тип, стратегия, авторитет и бодиграф по реальным данным рождения — бесплатно. Полный разбор каналов и профиля за баллы. Без фатализма и приговоров.",
    schemaKind: "Product",
  },
  "/products/surname-story": {
    title: "Тайна имени и фамилии — происхождение и звучание — ETerapy",
    description: "Личное досье имени и фамилии: происхождение, география, варианты латиницы, фоносемантика и честно обозначенный символический портрет.",
    schemaKind: "Product",
  },
  "/all-modalities": {
    title: "Сервисы самопознания — ETerapy",
    description: "Сервисы ETerapy от вопроса: рефлексия, Таро, натальная карта, нумерология, гороскоп и личный гид.",
    schemaKind: "Product",
  },
  "/checkin": {
    title: "Разбор — ETerapy",
    description: "Напишите ситуацию своими словами. Диалог уточнит контекст и даст бесплатный первичный ответ.",
    schemaKind: "Product",
  },
  "/practitioners": {
    title: "Специалист как следующий шаг — ETerapy",
    description: "Проверенные практики ETerapy доступны как следующий шаг после вопроса, контекста и понятной рекомендации.",
    schemaKind: "WebPage",
  },
  "/practitioners/apply": {
    title: "Стать практиком ETerapy",
    description: "Заявка для тарологов, астрологов и нумерологов: проверка, этика, расписание, сессии и прозрачные выплаты.",
    schemaKind: "WebPage",
  },
  "/legal/ethics": {
    title: "Этический кодекс — ETerapy",
    description: "Правила работы практиков ETerapy: безопасность, границы, запрет давления, прозрачность и последствия нарушений.",
    schemaKind: "Article",
  },
  "/legal/offer": {
    title: "Публичная оферта — ETerapy",
    description: "Условия использования ETerapy, оплаты, возвратов, ограничений ответственности и оказания услуг на платформе.",
    schemaKind: "Article",
  },
  "/legal/privacy": {
    title: "Политика конфиденциальности — ETerapy",
    description: "Какие данные собирает ETerapy, как они используются, защищаются, передаются и удаляются по запросу пользователя.",
    schemaKind: "Article",
  },
};

export function createPublicPageMetadata(route: PublicSeoRoute): Metadata {
  const seo = publicPageSeo[route];
  const url = canonicalUrl(route);
  // B390: брендовая OG-картинка для красивого превью при шеринге. «Дизайн
  // человека» — отдельный мотив (бодиграф), остальные публичные страницы — общий.
  const ogKind = route === "/products/human-design"
    ? "human-design"
    : route === "/products/surname-story"
      ? "surname-story"
      : "library";
  const ogImage = canonicalUrl(`/api/og?kind=${ogKind}`);

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url,
      siteName: "ETerapy",
      locale: "ru_RU",
      type: seo.schemaKind === "Article" ? "article" : "website",
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [ogImage],
    },
  };
}

export function jsonLdForPublicPage(route: PublicSeoRoute) {
  const seo = publicPageSeo[route];
  const url = canonicalUrl(route);
  const base = {
    "@context": "https://schema.org",
    "@type": seo.schemaKind,
    name: seo.title,
    headline: seo.title,
    description: seo.description,
    url,
    inLanguage: "ru-RU",
    isPartOf: {
      "@type": "WebSite",
      name: "ETerapy",
      url: seoOrigins.main,
    },
    publisher: {
      "@type": "Organization",
      name: "ETerapy",
      url: seoOrigins.main,
    },
  };

  if (seo.schemaKind === "Product") {
    return {
      ...base,
      brand: { "@type": "Brand", name: "ETerapy" },
      category: "Self-care digital service",
    };
  }

  return base;
}
