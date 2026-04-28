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
  "/all-modalities": {
    title: "Сервисы самопознания — ETerapy",
    description: "Question-first сервисы ETerapy: рефлексия, Таро, натальная карта, нумерология, гороскоп и личный гид.",
    schemaKind: "Product",
  },
  "/all-modalities/checkin": {
    title: "Рефлексия по вопросу — ETerapy",
    description: "Ответьте на несколько бережных вопросов и получите структурированный первичный ответ по вашей ситуации.",
    schemaKind: "Product",
  },
  "/all-modalities/guide": {
    title: "Личный гид — ETerapy",
    description: "Персональный текст по теме вашего запроса: контекст, возможные смыслы и следующий шаг без давления.",
    schemaKind: "Product",
  },
  "/all-modalities/tarot": {
    title: "Расклад Таро онлайн — ETerapy",
    description: "Сформулируйте вопрос и получите бережную интерпретацию расклада Таро с понятным итогом.",
    schemaKind: "Product",
  },
  "/all-modalities/natal": {
    title: "Натальная карта онлайн — ETerapy",
    description: "Получите интерпретацию натальной карты по дате, времени и месту рождения в понятном формате.",
    schemaKind: "Product",
  },
  "/all-modalities/numerology": {
    title: "Нумерология онлайн — ETerapy",
    description: "Рассчитайте число жизненного пути и получите краткую интерпретацию даты рождения и имени.",
    schemaKind: "Product",
  },
  "/all-modalities/horoscope": {
    title: "Персональный гороскоп — ETerapy",
    description: "Ежедневный, недельный или месячный прогноз с мягкой интерпретацией и практичным фокусом.",
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
