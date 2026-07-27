import { TAROT_PHRASES } from "./semantic-core/tarot";
import { NUMEROLOGY_PHRASES } from "./semantic-core/numerology";
import { NATAL_CHART_PHRASES } from "./semantic-core/natal-chart";
import { COMPATIBILITY_BY_DATE_PHRASES } from "./semantic-core/compatibility-by-date";
import { HOROSCOPE_PHRASES } from "./semantic-core/horoscope";
import { ARCANA_PHRASES } from "./semantic-core/arcana";
import { HUMAN_DESIGN_PHRASES } from "./semantic-core/human-design";
import { SURNAME_ORIGIN_PHRASES } from "./semantic-core/surname-origin";
import { FAMILY_QUESTIONS_PHRASES } from "./semantic-core/family-questions";
import { REFRAME_PHRASES } from "./semantic-core/reframe";
import { CHAT_ANALYSIS_PHRASES } from "./semantic-core/chat-analysis";
import { PAIR_PHRASES } from "./semantic-core/pair";
import { DEEP_REPORT_PHRASES } from "./semantic-core/deep-report";
import type { SemanticCluster, SemanticCoreRow } from "./semantic-core-types";

export const SEMANTIC_CORE: readonly SemanticCluster[] = [
  {
    service: "tarot",
    name: "Расклад Таро",
    cluster: "Таро и гадания",
    landing: "/products/tarot",
    phrases: TAROT_PHRASES,
  },
  {
    service: "numerology",
    name: "Матрица судьбы",
    cluster: "Матрица судьбы",
    landing: "/products/numerology",
    phrases: NUMEROLOGY_PHRASES,
  },
  {
    service: "natal-chart",
    name: "Натальная карта",
    cluster: "Астрология",
    landing: "/products/natal-chart",
    phrases: NATAL_CHART_PHRASES,
  },
  {
    service: "compatibility-by-date",
    name: "Совместимость по дате",
    cluster: "Совместимость",
    landing: "/products/compatibility-by-date",
    phrases: COMPATIBILITY_BY_DATE_PHRASES,
  },
  {
    service: "horoscope",
    name: "Гороскоп",
    cluster: "Прямой ответ",
    landing: "/products/horoscope",
    phrases: HOROSCOPE_PHRASES,
  },
  {
    service: "arcana",
    name: "Арканы судьбы",
    cluster: "Арканы",
    landing: "/products/arcana",
    phrases: ARCANA_PHRASES,
  },
  {
    service: "human-design",
    name: "Дизайн человека",
    cluster: "Дизайн человека",
    landing: "/products/human-design",
    phrases: HUMAN_DESIGN_PHRASES,
  },
  {
    service: "surname-origin",
    name: "Происхождение фамилии",
    cluster: "Имя и род",
    landing: "/products/surname-origin",
    phrases: SURNAME_ORIGIN_PHRASES,
  },
  {
    service: "family-questions",
    name: "Семейные вопросы",
    cluster: "Семья и род",
    landing: "/products/family-questions",
    phrases: FAMILY_QUESTIONS_PHRASES,
  },
  {
    service: "reframe",
    name: "Переосмысление",
    cluster: "Ясность в ситуации",
    landing: "/products/reframe",
    phrases: REFRAME_PHRASES,
  },
  {
    service: "chat-analysis",
    name: "Разбор переписки",
    cluster: "Отношения",
    landing: "/products/chat-analysis",
    phrases: CHAT_ANALYSIS_PHRASES,
  },
  {
    service: "pair",
    name: "Вместе",
    cluster: "Пара",
    landing: "/products/pair",
    phrases: PAIR_PHRASES,
  },
  {
    service: "deep-report",
    name: "Подробный разбор",
    cluster: "Ясность и поддержка",
    landing: "/ai-psychologist",
    phrases: DEEP_REPORT_PHRASES,
  },
] as const;

export function semanticCoreRows(): SemanticCoreRow[] {
  return SEMANTIC_CORE.flatMap((cluster) =>
    cluster.phrases.map((item) => ({
      ...item,
      service: cluster.service,
      serviceName: cluster.name,
      cluster: cluster.cluster,
      landing: cluster.landing,
    })),
  );
}
