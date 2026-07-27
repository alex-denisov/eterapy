import type { Metadata } from "next";
import { canonicalUrl, publicSeoRoutes, seoOrigins } from "@/lib/seo";
import { HOME_CONTENT_REVIEWED_AT } from "@/lib/home-authority-content";

export type PublicSeoRoute = typeof publicSeoRoutes[number];

type SchemaKind = "WebPage" | "Article" | "FAQPage" | "Product" | "Service";

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
  "/editorial-policy": {
    title: "Редакционная политика ETerapy",
    description: "Как редакция ETerapy готовит, проверяет и обновляет материалы: авторство организации, работа с источниками, ИИ, исправления и границы сервиса.",
    schemaKind: "Article",
  },
  "/ai-psychologist": {
    title: "ИИ-психолог онлайн бесплатно: анонимный чат | ETerapy",
    description: "Опишите ситуацию и получите бесплатный первичный разбор в анонимном чате с ИИ. Без карты и регистрации. ETerapy не ставит диагнозов и не заменяет психолога.",
    schemaKind: "Service",
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
    title: "Тест для двоих: отвечают оба, сравнение взглядов | ETerapy",
    description: "Три формата разобраться вместе: взгляд со стороны от близкого по ссылке, сверить взгляды по согласию или посмотреть на совместимость. Начало бесплатно.",
    schemaKind: "Product",
  },
  "/telegram": {
    title: "ETerapy в Telegram",
    description: "Разбор, ежедневные карточки и мягкие напоминания ETerapy в Telegram с управлением приватностью.",
    schemaKind: "WebPage",
  },
  "/library": {
    title: "Библиотека жизненных вопросов и символических практик | ETerapy",
    description: "Содержательные вопросы об отношениях, выборе, работе, тревоге, снах, Таро и астрологии: короткий разбор, личный контекст и следующий шаг.",
    schemaKind: "Article",
  },
  "/products": {
    title: "Услуги — ETerapy",
    description: "Цифровые углубления, совместные форматы, эзотерические разборы и встречи со специалистами. Начните с бесплатного первичного ответа или откройте нужную услугу сразу.",
    schemaKind: "Product",
  },
  "/products/reframe": {
    title: "Как отпустить ситуацию: разобрать и сделать первый шаг | ETerapy",
    description: "Когнитивный рефрейминг одной ситуации: мысли против фактов, чувства, другой взгляд и первый шаг — все четыре угла под ваш запрос.",
    schemaKind: "Product",
  },
  "/products/deep-report": {
    title: "Подробный разбор — ETerapy",
    description: "Подробный структурный разбор вашей ситуации: что происходит, как это сложилось, что удерживает, на что опереться, сценарии и маршрут действий.",
    schemaKind: "Product",
  },
  "/products/chat-analysis": {
    title: "Анализ переписки: понять тон и подготовить ответ | ETerapy",
    description: "Приватный анализ переписки: отделите текст от догадок, разберите тон и получите варианты ответа. Без чтения мыслей, проверки на измену и скрытых обещаний.",
    schemaKind: "Product",
  },
  "/products/chat": {
    title: "Решить вопрос в чате — ETerapy",
    description: "Живой диалог 45 минут, чтобы разобрать вопрос в своём темпе. Платная синхронная услуга — продолжение бесплатного первичного разбора.",
    schemaKind: "Product",
  },
  "/products/tarot": {
    title: "Расклад Таро онлайн: карты и разбор ситуации | ETerapy",
    description: "Задайте один вопрос и получите расклад Таро онлайн: значение карт, главную развилку и практичный шаг. Без фатальных прогнозов и обещаний будущего.",
    schemaKind: "Product",
  },
  "/products/natal-chart": {
    title: "Натальная карта онлайн: рассчитать с расшифровкой | ETerapy",
    description: "Рассчитайте натальную карту по дате, времени и месту рождения и получите понятную расшифровку ключевых тем. Символический портрет, не прогноз.",
    schemaKind: "Product",
  },
  "/products/compatibility-by-date": {
    title: "Совместимость по дате рождения: синастрия онлайн | ETerapy",
    description: "Сравните две натальные карты: ресурсы пары, разные ритмы, точки напряжения и вопросы для разговора. Синастрия без процента любви и приговоров.",
    schemaKind: "Product",
  },
  "/products/numerology": {
    title: "Матрица судьбы: рассчитать онлайн с расшифровкой | ETerapy",
    description: "Рассчитайте Матрицу судьбы по дате рождения: 22 энергии, ключевые позиции, отношения, деньги и периоды с понятной расшифровкой без фатализма.",
    schemaKind: "Product",
  },
  "/products/horoscope": {
    title: "Гороскоп на вопрос: точный ответ да или нет | ETerapy",
    description: "Карта момента для одного точного вопроса: прямой эзотерический ответ, сигнификаторы, Луна, аспекты и противоречия.",
    schemaKind: "Product",
  },
  "/products/arcana": {
    title: "Аркан по дате рождения: арканы судьбы онлайн | ETerapy",
    description: "Карты рождения Таро по дате: постоянная пара Старших арканов — карта рождения и карта души — без случайной вытяжки.",
    schemaKind: "Product",
  },
  "/products/family-questions": {
    title: "Семейные вопросы: родовые программы и повторы в семье | ETerapy",
    description: "Бережная карта повторов рода: какие роли и темы передаются по семье и что можно мягко прервать. Без приговоров и диагнозов.",
    schemaKind: "Product",
  },
  "/products/human-design": {
    title: "Дизайн человека — узнать свой тип бесплатно — ETerapy",
    description: "Ваш тип, стратегия, авторитет и бодиграф по реальным данным рождения — бесплатно. Полный разбор каналов и профиля за баллы. Без фатализма и приговоров.",
    schemaKind: "Product",
  },
  "/products/surname-origin": {
    title: "Происхождение фамилии: значение, история и число рода | ETerapy",
    description: "Рассчитайте число фамилии и Старший Аркан, разберите родовой ресурс, тень, деньги и отношения или сравните код до и после смены фамилии.",
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
    : route === "/products/surname-origin"
      ? "surname-origin"
      : "library";
  const ogImage = canonicalUrl(`/api/og?kind=${ogKind}`);

  return {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: url,
    },
    authors: route === "/" ? [{ name: "Редакция ETerapy", url: canonicalUrl("/about") }] : undefined,
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    other: route === "/" ? { "article:modified_time": HOME_CONTENT_REVIEWED_AT } : undefined,
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
      "@id": `${seoOrigins.main}/#organization`,
      name: "ETerapy",
      url: seoOrigins.main,
      logo: { "@type": "ImageObject", url: canonicalUrl("/icon.svg") },
      sameAs: ["https://t.me/eterapy_bot"],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        url: canonicalUrl("/help"),
        availableLanguage: "ru",
      },
    },
  };

  if (seo.schemaKind === "Product") {
    return {
      ...base,
      brand: { "@type": "Brand", name: "ETerapy" },
      category: "Self-care digital service",
    };
  }

  if (seo.schemaKind === "Service") {
    return {
      ...base,
      provider: base.publisher,
      serviceType: "Информационный разбор жизненной ситуации с помощью ИИ",
      areaServed: "RU",
      availableLanguage: "ru",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "RUB",
        description: "Бесплатный первичный разбор без банковской карты",
      },
    };
  }

  return base;
}
