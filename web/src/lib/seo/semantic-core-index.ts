import { TAROT_PHRASES } from "./semantic-core/tarot";
import { NUMEROLOGY_PHRASES } from "./semantic-core/numerology";
import { NATALCHART_PHRASES } from "./semantic-core/natal-chart";
import { SYNASTRY_PHRASES } from "./semantic-core/synastry";
import { HORARY_PHRASES } from "./semantic-core/horary";
import { TAROTNUMEROLOGY_PHRASES } from "./semantic-core/tarot-numerology";
import { HUMANDESIGN_PHRASES } from "./semantic-core/human-design";
import { SURNAMESTORY_PHRASES } from "./semantic-core/surname-story";
import { FAMILYSCENARIOS_PHRASES } from "./semantic-core/family-scenarios";
import { REFRAME_PHRASES } from "./semantic-core/reframe";
import { CHATANALYSIS_PHRASES } from "./semantic-core/chat-analysis";
import { PAIR_PHRASES } from "./semantic-core/pair";
import { DEEPREPORT_PHRASES } from "./semantic-core/deep-report";
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
    phrases: NATALCHART_PHRASES,
  },
  {
    service: "compatibility",
    name: "Совместимость по дате",
    cluster: "Совместимость",
    landing: "/products/compatibility",
    phrases: SYNASTRY_PHRASES,
  },
  {
    service: "horoscope",
    name: "Гороскоп",
    cluster: "Прямой ответ",
    landing: "/products/horoscope",
    phrases: HORARY_PHRASES,
  },
  {
    service: "arcana",
    name: "Арканы судьбы",
    cluster: "Арканы",
    landing: "/products/arcana",
    phrases: TAROTNUMEROLOGY_PHRASES,
  },
  {
    service: "human-design",
    name: "Дизайн человека",
    cluster: "Дизайн человека",
    landing: "/products/human-design",
    phrases: HUMANDESIGN_PHRASES,
  },
  {
    service: "surname-origin",
    name: "Происхождение фамилии",
    cluster: "Имя и род",
    landing: "/products/surname-origin",
    phrases: SURNAMESTORY_PHRASES,
  },
  {
    service: "family-questions",
    name: "Семейные вопросы",
    cluster: "Семья и род",
    landing: "/products/family-questions",
    phrases: FAMILYSCENARIOS_PHRASES,
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
    phrases: CHATANALYSIS_PHRASES,
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
    phrases: DEEPREPORT_PHRASES,
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
