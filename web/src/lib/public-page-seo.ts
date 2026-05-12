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
    description: "Путь v5: вопрос, бесплатный первичный ответ, углубление по подписке или продукту и специалист только как осознанный следующий шаг.",
    schemaKind: "Article",
  },
  "/how-to-choose": {
    title: "Как выбрать практика — ETerapy",
    description: "Как безопасно выбрать таролога, астролога или нумеролога: цель запроса, профиль, отзывы, цена и красные флаги.",
    schemaKind: "Article",
  },
  "/pricing": {
    title: "Цены и тарифы ETerapy",
    description: "Прозрачные цены v5: бесплатный первичный ответ, разовые углубления, разбор переписки, совместимость, 7 дней к ясности, подписки и Practitioner Pro.",
    schemaKind: "Product",
  },
  "/missions": {
    title: "Миссии и практика ясности — ETerapy",
    description: "Короткая ежедневная практика ETerapy: мягкие миссии, карта дня, кредиты и возвращение к себе без давления.",
    schemaKind: "Product",
  },
  "/practice": {
    title: "Практика ясности — ETerapy",
    description: "Ежедневная мягкая практика ETerapy: один вопрос, короткое возвращение к себе, кредиты ясности и напоминания без давления.",
    schemaKind: "Product",
  },
  "/circle": {
    title: "Круг ясности — ETerapy",
    description: "Групповой формат для 2–5 участников: общий вопрос, приватные ответы, согласие и бережный итоговый разбор.",
    schemaKind: "Product",
  },
  "/pair": {
    title: "Разобраться вдвоём — ETerapy",
    description: "Парный формат ETerapy: каждый отвечает отдельно, результат открывается по согласию и помогает начать спокойный разговор.",
    schemaKind: "Product",
  },
  "/telegram": {
    title: "ETerapy в Telegram",
    description: "Диалог ясности, ежедневные карточки и мягкие напоминания ETerapy в Telegram с управлением приватностью.",
    schemaKind: "WebPage",
  },
  "/library": {
    title: "Библиотека анонимных вопросов — ETerapy",
    description: "Модерируемая SEO-библиотека обезличенных вопросов с короткими разборами, темами, реакциями и входом в персональный диалог.",
    schemaKind: "Article",
  },
  "/products": {
    title: "Продукты ETerapy v5",
    description: "Все v5 продукты углубления: первичный ответ, 4 ракурса, глубокий отчет, разбор переписки, совместимость, 7 дней к ясности и Моя карта.",
    schemaKind: "Product",
  },
  "/products/primary-answer": {
    title: "Первичный ответ — ETerapy",
    description: "Бесплатный question-first продукт: короткий уточняющий диалог, структурированный первичный ответ и безопасный следующий шаг.",
    schemaKind: "Product",
  },
  "/products/perspectives": {
    title: "4 ракурса ответа — ETerapy",
    description: "Платное углубление: рациональный, эмоциональный, символический и практический ракурс одного вопроса.",
    schemaKind: "Product",
  },
  "/products/deep-report": {
    title: "Глубокий отчет — ETerapy",
    description: "Развернутый отчет по ситуации на основе диалога, доступный после оплаты или по подписке.",
    schemaKind: "Product",
  },
  "/products/chat-analysis": {
    title: "Разбор переписки — ETerapy",
    description: "Приватный анализ переписки с предупреждением о персональных данных, праве использования и удалении исходника.",
    schemaKind: "Product",
  },
  "/products/compatibility": {
    title: "Совместимость — ETerapy",
    description: "Парный отчет по совместимости с invite flow, согласием второго участника и приватностью ответов.",
    schemaKind: "Product",
  },
  "/products/seven-days": {
    title: "7 дней к ясности — ETerapy",
    description: "Маршрут из ежедневных шагов по 5-10 минут, паузой, напоминаниями и итоговым отчетом.",
    schemaKind: "Product",
  },
  "/products/my-map": {
    title: "Моя карта ETerapy",
    description: "Приватное пространство для сохранения вопросов, ответов, отчетов, маршрутов и личных выводов.",
    schemaKind: "Product",
  },
  "/all-modalities": {
    title: "Сервисы самопознания — ETerapy",
    description: "Сервисы ETerapy от вопроса: рефлексия, Таро, натальная карта, нумерология, гороскоп и личный гид.",
    schemaKind: "Product",
  },
  "/checkin": {
    title: "Диалог ясности — ETerapy",
    description: "Напишите ситуацию своими словами. Диалог уточнит контекст и даст бесплатный первичный ответ.",
    schemaKind: "Product",
  },
  "/all-modalities/checkin": {
    title: "Диалог ясности — ETerapy",
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
    },
    twitter: {
      card: "summary",
      title: seo.title,
      description: seo.description,
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
