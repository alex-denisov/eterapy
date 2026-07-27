/**
 * B600 — реестр маркетинговых URL: вес, судьба и сторож изменений.
 *
 * ЗАЧЕМ. За один батч №12 нашлось три случая, когда адрес молча переставал
 * работать: несуществующий параметр `direction` в ссылке из ядра,
 * переименованная тема библиотеки и закрытый `/cabinet/practice`. Ни один не
 * был бы замечен — 404 никто не мониторит, а «параметр проигнорирован» и
 * «пустой список» отдают 200. Батч №15 добавил четвёртый случай, уже
 * намеренный: пять адресов услуг сменились разом.
 *
 * ЧТО ЭТО ЗА ФАЙЛ. Единственный источник правды о том, какие наши адреса
 * чего-то стоят и что с ними стало. Из него растут три вещи:
 *
 *   1. вес адреса (сколько трафика мы теряем, если он исчезнет);
 *   2. решение о судьбе исчезнувшего адреса — редирект или осознанное «убрали»;
 *   3. сторож: адрес с весом не может пропасть без решения — это проверяется
 *      прогоном, а не памятью того, кто правит роут.
 *
 * ПОЧЕМУ «осознанно убрали» — полноправное решение, а не дыра. Владелец по
 * пяти услугам сказал дословно: «не делаем редиректы, а именно меняем». Сторож
 * обязан отличать это от забытого адреса, иначе его отключат в первый же раз,
 * когда он помешает.
 */

import { publicSeoRoutes } from "@/lib/seo";
import { SEMANTIC_CORE } from "@/lib/seo/semantic-core-index";

export type UrlWeight = "P1" | "P2" | "P3";

export type UrlSource = "seo-core" | "seo-route" | "library" | "publication" | "manual";

export interface MarketingUrl {
  path: string;
  weight: UrlWeight;
  sources: UrlSource[];
  /** Сколько фраз ядра ведут на этот адрес. */
  corePhrases: number;
  /** Суммарный замеренный спрос этих фраз, показов в месяц. */
  coreDemand: number;
}

/** Судьба адреса, которого больше нет по этому пути. */
export type RetirementDecision =
  | {
      kind: "redirect";
      target: string;
      decidedAt: string;
      reason: string;
    }
  | {
      kind: "gone";
      decidedAt: string;
      reason: string;
    };

/**
 * Адреса, которых больше нет, и что с ними решено.
 *
 * Ключ — путь БЕЗ хоста и без завершающего слэша, как он был в выдаче и в
 * рассылках. Пустой `reason` недопустим: через полгода «почему 404» — это
 * вопрос, на который отвечает только этот файл.
 */
export const RETIRED_URLS: Readonly<Record<string, RetirementDecision>> = {
  // B609, батч №15. Владелец: «не делаем редиректы, а именно меняем».
  "/products/horary": {
    kind: "gone",
    decidedAt: "2026-07-27",
    reason: "B609: услуга переименована в «Гороскоп» (/products/horoscope), редирект владелец решил не ставить",
  },
  "/products/surname-story": {
    kind: "gone",
    decidedAt: "2026-07-27",
    reason: "B609: «Происхождение фамилии» (/products/surname-origin), редирект владелец решил не ставить",
  },
  "/products/family-scenarios": {
    kind: "gone",
    decidedAt: "2026-07-27",
    reason: "B609: «Семейные вопросы» (/products/family-questions), редирект владелец решил не ставить",
  },
  "/products/synastry": {
    kind: "gone",
    decidedAt: "2026-07-27",
    reason: "B609: «Совместимость по дате» (/products/compatibility-by-date), редирект владелец решил не ставить",
  },
  "/products/tarot-numerology": {
    kind: "gone",
    decidedAt: "2026-07-27",
    reason: "B609: «Арканы судьбы» (/products/arcana), редирект владелец решил не ставить",
  },

  // B593, батч №12: экран закрыт, но на него ведут разосланные письма, push и
  // ссылки Telegram-бота — поэтому именно редирект, а не 404.
  "/cabinet/practice": {
    kind: "redirect",
    target: "/cabinet/diary",
    decidedAt: "2026-07-27",
    reason: "B593: ритуал переехал на «Дневник»; на старый адрес ведут разосланные письма и push",
  },
  // B605, батч №13: переадресации ставились ради разосланных ссылок, а живых
  // клиентов, которые могли по ним прийти, не оказалось.
  "/practice": {
    kind: "gone",
    decidedAt: "2026-07-27",
    reason: "B605: раздел удалён совсем; переходов по старому адресу не было",
  },
};

/** Вес адреса по данным ядра: P1 — есть фразы приоритета P1. */
function weightFromCore(p1Phrases: number, phrases: number, isSeoRoute: boolean): UrlWeight {
  if (p1Phrases > 0) return "P1";
  if (phrases > 0) return "P2";
  return isSeoRoute ? "P2" : "P3";
}

function normalize(path: string): string {
  const withoutQuery = path.split("?")[0] || "/";
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, "") : withoutQuery;
}

/**
 * Реестр: публичные SEO-маршруты + посадочные семантического ядра.
 *
 * Ядро даёт вес, маршруты — полноту. Одно без другого врёт: у половины
 * публичных страниц фраз в ядре нет вовсе (правовые, «о нас»), а часть
 * посадочных ядра — параметризованные адреса библиотеки, которых в списке
 * маршрутов нет по построению.
 */
export function marketingUrlRegistry(): MarketingUrl[] {
  const byPath = new Map<string, MarketingUrl>();

  const ensure = (rawPath: string, source: UrlSource): MarketingUrl => {
    const path = normalize(rawPath);
    const existing = byPath.get(path);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      return existing;
    }
    const created: MarketingUrl = { path, weight: "P3", sources: [source], corePhrases: 0, coreDemand: 0 };
    byPath.set(path, created);
    return created;
  };

  for (const route of publicSeoRoutes) ensure(route, "seo-route");

  const p1ByPath = new Map<string, number>();
  for (const cluster of SEMANTIC_CORE) {
    const path = normalize(cluster.landing);
    const entry = ensure(cluster.landing, path.startsWith("/library") ? "library" : "seo-core");
    if (!entry.sources.includes("seo-core")) entry.sources.push("seo-core");
    entry.corePhrases += cluster.phrases.length;
    entry.coreDemand += cluster.phrases.reduce((sum, phrase) => sum + phrase.demand, 0);
    p1ByPath.set(path, (p1ByPath.get(path) ?? 0) + cluster.phrases.filter((p) => p.priority === "P1").length);
  }

  const seoRoutes = new Set<string>(publicSeoRoutes.map(normalize));
  for (const entry of byPath.values()) {
    entry.weight = weightFromCore(p1ByPath.get(entry.path) ?? 0, entry.corePhrases, seoRoutes.has(entry.path));
  }

  return [...byPath.values()].sort((a, b) => b.coreDemand - a.coreDemand || a.path.localeCompare(b.path));
}

export interface RegistryViolation {
  path: string;
  weight: UrlWeight;
  /** Почему это нарушение — текстом, а не кодом: его читает человек в упавшем прогоне. */
  message: string;
}

/**
 * Сторож. Адрес с весом P1/P2 обязан быть либо живым, либо иметь решение о
 * судьбе. Третьего — «просто пропал» — быть не должно.
 *
 * P3 намеренно не сторожится: это длинный хвост библиотеки, где адреса
 * появляются и исчезают вместе с контентом, и падающий на каждой правке
 * сторож перестал бы работать сторожем.
 */
export function findRegistryViolations(livePaths: Iterable<string>): RegistryViolation[] {
  const live = new Set<string>([...livePaths].map(normalize));
  const violations: RegistryViolation[] = [];

  for (const entry of marketingUrlRegistry()) {
    if (entry.weight === "P3") continue;
    if (live.has(entry.path)) continue;
    const decision = RETIRED_URLS[entry.path];
    if (!decision) {
      violations.push({
        path: entry.path,
        weight: entry.weight,
        message:
          `Адрес веса ${entry.weight} исчез из маршрутов и не имеет решения. ` +
          `Добавьте редирект или запись в RETIRED_URLS с причиной и датой.`,
      });
      continue;
    }
    if (decision.kind === "redirect" && !live.has(normalize(decision.target))) {
      violations.push({
        path: entry.path,
        weight: entry.weight,
        message: `Редирект ведёт на ${decision.target}, а такого маршрута нет — цепочка обрывается в 404.`,
      });
    }
  }

  return violations;
}

export const URL_STATUS_LABELS = {
  live: "Живой",
  redirect: "Редирект",
  gone: "Убран осознанно",
  missing: "Пропал без решения",
} as const;

export type UrlStatus = keyof typeof URL_STATUS_LABELS;

/**
 * Карта живых маршрутов по публичному списку SEO-адресов.
 *
 * Это ПРИБЛИЖЕНИЕ, и знать об этом надо: список маршрутов не содержит
 * параметризованных адресов вроде `/library/<slug>`, поэтому они считаются
 * живыми по префиксу. Точный ответ даёт только HTTP-обход (фаза мониторинга) —
 * до неё экран честно показывает то, что знает карта, а не выдаёт догадку за
 * проверку.
 */
export function routeMapLivePaths(): Set<string> {
  return new Set<string>(publicSeoRoutes.map(normalize));
}

export function urlStatus(path: string, livePaths: Set<string>): UrlStatus {
  const normalized = normalize(path);
  if (livePaths.has(normalized)) return "live";

  // Решение о судьбе адреса СИЛЬНЕЕ совпадения по префиксу: `/products/horary`
  // снят, хотя `/products` живой. Иначе снятый адрес показывался бы живым
  // ровно там, где это важнее всего знать.
  const decision = RETIRED_URLS[normalized];
  if (decision) return decision.kind === "redirect" ? "redirect" : "gone";

  for (const live of livePaths) {
    if (live !== "/" && normalized.startsWith(`${live}/`)) return "live";
  }
  return "missing";
}
