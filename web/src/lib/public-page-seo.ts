import type { Metadata } from "next";
import { canonicalUrl, publicSeoRoutes, seoOrigins } from "@/lib/seo";
import { HOME_CONTENT_REVIEWED_AT } from "@/lib/home-authority-content";
import { getProductPriceKopecks } from "@/lib/product-prices";

export type PublicSeoRoute = typeof publicSeoRoutes[number];

type SchemaKind = "WebPage" | "CollectionPage" | "Article" | "FAQPage" | "Product" | "Service";

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
    schemaKind: "WebPage",
  },
  "/pricing/compare": {
    title: "Сравнение тарифов ETerapy",
    description: "Подробное сравнение Free, Plus и Premium: баллы, карта, цифровые продукты, маршруты, ограничения и что не входит в подписки.",
    schemaKind: "WebPage",
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
    schemaKind: "CollectionPage",
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
  // B701 · Контур B. Заголовки четырёх страниц ниже обещали «расшифровку» и
  // «разбор», то есть ровно то, что лежит ЗА оплатой, и умалчивали о том, что
  // отдаётся даром. Замер 2026-08-14 (браузер, прод) показал обратную картину:
  // расчёт уже бесплатный и виден до кнопки оплаты — матрица рисует октаграмму
  // с посчитанными энергиями, Таро даёт «Вытянуть карты бесплатно», натальная
  // «Рассчитать колесо бесплатно», совместимость «Рассчитать карту пары
  // бесплатно». Одновременно «бесплатно» — самый частотный уточнитель спроса
  // («матрица судьбы рассчитать бесплатно» 41 879/мес, «натальная карта
  // рассчитать бесплатно» 16 706/мес).
  //
  // Поэтому обещание перевёрнуто: в заголовке то, что человек получит сразу,
  // в описании честная граница платного. Это не ход за позициями — при ИКС 0
  // метаданные их не двигают (B710); это снятие разрыва «обещали текст —
  // показали оплату», из-за которого посетитель возвращается в выдачу.
  // B711 · Хаб расчётной сетки. Заголовок под запрос «планеты в знаках», а не
  // под наше внутреннее название раздела: сетка и заводилась ради того, чтобы
  // формулировка страницы совпадала с формулировкой запроса.
  "/astro/planety-v-znakah": {
    title: "Планеты в знаках зодиака: значение и расчёт | ETerapy",
    description: "Что означает планета в каждом знаке зодиака: разбор сочетания, посчитанные по эфемеридам периоды стояния и бесплатный расчёт по вашей дате рождения.",
    schemaKind: "CollectionPage",
  },
  "/products/tarot": {
    title: "Расклад Таро онлайн: вытянуть карты бесплатно | ETerapy",
    description: "Задайте вопрос и вытяните карты бесплатно — одна, три или Кельтский крест. Связный разбор расклада под ваш вопрос — отдельно. Без фатальных прогнозов.",
    schemaKind: "Product",
  },
  "/products/natal-chart": {
    title: "Натальная карта: рассчитать онлайн бесплатно | ETerapy",
    description: "Дата, время и место рождения — и колесо с планетами и домами строится бесплатно прямо на странице. Расшифровка ключевых тем карты — отдельно, по желанию.",
    schemaKind: "Product",
  },
  "/products/compatibility-by-date": {
    title: "Совместимость по дате рождения: синастрия онлайн бесплатно | ETerapy",
    description: "Две даты рождения — карта пары строится бесплатно прямо на странице. Ресурсы, разные ритмы и точки напряжения разбираются отдельно. Без процента любви и приговоров.",
    schemaKind: "Product",
  },
  "/products/numerology": {
    title: "Матрица судьбы: рассчитать бесплатно по дате рождения | ETerapy",
    description: "Введите дату рождения — 22 энергии матрицы посчитаются бесплатно прямо на странице. Подробная расшифровка каждой позиции — отдельно, по желанию. Без фатализма.",
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
    schemaKind: "Service",
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

export function getPublicPageOgImage(route: PublicSeoRoute): string {
  const ogKind = route === "/products/human-design"
    ? "human-design"
    : route === "/products/surname-origin"
      ? "surname-origin"
      : "library";
  return canonicalUrl(`/api/og?kind=${ogKind}`);
}

export function createPublicPageMetadata(route: PublicSeoRoute): Metadata {
  const seo = publicPageSeo[route];
  const url = canonicalUrl(route);
  // B390: брендовая OG-картинка для красивого превью при шеринге. «Дизайн
  // человека» — отдельный мотив (бодиграф), остальные публичные страницы — общий.
  const ogImage = getPublicPageOgImage(route);

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

const PRODUCT_KEY_BY_ROUTE: Partial<Record<PublicSeoRoute, string>> = {
  "/products/reframe": "reframe",
  "/products/deep-report": "deep-report",
  "/products/chat-analysis": "chat-analysis",
  "/products/chat": "chat-session",
  "/products/pair": "pair",
  "/products/tarot": "tarot",
  "/products/natal-chart": "natal-chart",
  "/products/compatibility-by-date": "compatibility-by-date",
  "/products/numerology": "numerology",
  "/products/horoscope": "horoscope",
  "/products/arcana": "arcana",
  "/products/family-questions": "family-questions",
  "/products/human-design": "human-design",
  "/products/surname-origin": "surname-origin",
};

export function jsonLdForPublicPage(route: PublicSeoRoute, options?: { offerPriceRubles?: number }) {
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
      // B708 · Профили бренда, подтверждённые владельцем 2026-08-13.
      //
      // По `sameAs` поисковики и ИИ-движки склеивают разрозненные профили в
      // ОДНУ сущность. До этой правки здесь стоял один бот — значит для машины
      // пять живых площадок были пятью незнакомцами, а накопленные там сигналы
      // не приходили бренду вовсе. Это и есть п.14 контура B701.
      //
      // Адреса записаны так, как их отдаёт сама площадка: `vk.ru` (не `.com`)
      // и `threads.com` (не `.net`) — переписывать «как правильнее» нельзя,
      // сверка идёт по строке.
      //
      // B701 · Карточка Яндекс Бизнеса (B551, 2026-07-22) в этот список не
      // попала, хотя она живая: `/profile/207723866652` отдаёт 200 и заголовок
      // «Eterapy, программное обеспечение». Это единственный профиль, который
      // Яндекс считает организацией, и без него сайт и карточка оставались для
      // него двумя разными объектами.
      sameAs: [
        "https://yandex.ru/profile/207723866652",
        "https://t.me/eterapy",
        "https://t.me/eterapy_bot",
        "https://vk.ru/eterapy",
        "https://dzen.ru/eterapy",
        "https://instagram.com/eterapy_official",
        "https://www.threads.com/@eterapy_official",
      ],
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        url: canonicalUrl("/help"),
        availableLanguage: "ru",
      },
    },
  };

  if (seo.schemaKind === "Product") {
    const productKey = PRODUCT_KEY_BY_ROUTE[route];
    const defaultKopecks = productKey ? getProductPriceKopecks(productKey) : null;
    const offerPriceRubles = options?.offerPriceRubles
      ?? (defaultKopecks === null ? null : defaultKopecks / 100);
    const productImage = getPublicPageOgImage(route);
    return {
      ...base,
      image: [productImage],
      brand: { "@type": "Brand", name: "ETerapy" },
      category: "Self-care digital service",
      ...(offerPriceRubles !== null ? {
        offers: {
          "@type": "Offer",
          url,
          price: offerPriceRubles.toFixed(2),
          priceCurrency: "RUB",
          availability: "https://schema.org/InStock",
          itemCondition: "https://schema.org/NewCondition",
          priceValidUntil: "2027-12-31",
          seller: base.publisher,
        },
      } : {}),
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
